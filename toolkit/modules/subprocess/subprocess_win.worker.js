/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* exported Process */

/* import-globals-from subprocess_shared.js */
/* import-globals-from subprocess_shared_win.js */
/* import-globals-from subprocess_worker_common.js */
importScripts(
  "resource://gre/modules/subprocess/subprocess_shared.js",
  "resource://gre/modules/subprocess/subprocess_shared_win.js",
  "resource://gre/modules/subprocess/subprocess_worker_common.js"
);

const POLL_TIMEOUT = 5000;

// The exit code that we send when we forcibly terminate a process.
const TERMINATE_EXIT_CODE = 0x7f;

let io;

// We use IOCP to monitor for IO completion on Pipe and process termination:
// - CreateIoCompletionPort with Pipe.
// - JOBOBJECT_ASSOCIATE_COMPLETION_PORT with Process.
// - GetQueuedCompletionStatus to query completion (receives CompletionKey).
//
// The CompletionKey can be an arbitrarily chosen value, used to identify the
// target of the IOCP notification. It is defined as ctypes.uintptr_t, so in
// theory it could be 64 or 32 bit. The number of pipes and processes that we
// create can be represented in fewer than 32 bits. We therefore use the higher
// order bits to tag the ID to distinguish Pipes, Processes and custom IOCP
// messages (e.g. IOCP_COMPLETION_KEY_WAKE_WORKER) from each other.
class IOCPKeyGen {
  // The IOCP_KEY_IS_PIPE and IOCP_KEY_IS_PROC bits are mutually exclusive.
  static IOCP_KEY_IS_PIPE = 1 << 31;
  static IOCP_KEY_IS_PROC = 1 << 30;

  static keyForPipe(pipe) {
    // pipe.id starts at 0 (nextPipeId in this file).
    return (IOCPKeyGen.IOCP_KEY_IS_PIPE | pipe.id) >>> 0;
  }
  static keyForProcess(process) {
    // process.id starts at 0 (nextProcessId++ in subprocess_worker_common.js).
    return (IOCPKeyGen.IOCP_KEY_IS_PROC | process.id) >>> 0;
  }

  static isPipeKey(completionKey) {
    return !!(IOCPKeyGen.IOCP_KEY_IS_PIPE & completionKey);
  }
  static isProcessKey(completionKey) {
    return !!(IOCPKeyGen.IOCP_KEY_IS_PROC & completionKey);
  }

  // Only use this if isPipeKey(completionKey) is true:
  static pipeIdFromKey(completionKey) {
    return (~IOCPKeyGen.IOCP_KEY_IS_PIPE & completionKey) >>> 0;
  }
  // Only use this if isProcessKey(completionKey) is true:
  static processIdFromKey(completionKey) {
    return (~IOCPKeyGen.IOCP_KEY_IS_PROC & completionKey) >>> 0;
  }
}

let nextPipeId = 0;

class Pipe extends BasePipe {
  // origHandle MUST be opened with the FILE_FLAG_OVERLAPPED flag.
  constructor(process, origHandle) {
    super();

    let handle = win32.HANDLE();

    let curProc = libc.GetCurrentProcess();
    libc.DuplicateHandle(
      curProc,
      origHandle,
      curProc,
      handle.address(),
      0,
      false /* inheritable */,
      win32.DUPLICATE_SAME_ACCESS
    );

    origHandle.dispose();

    this.id = nextPipeId++;
    this.process = process;

    this.handle = win32.Handle(handle);

    this.overlapped = win32.OVERLAPPED();

    let ok = libc.CreateIoCompletionPort(
      handle,
      io.iocpCompletionPort,
      IOCPKeyGen.keyForPipe(this),
      0 // Ignored.
    );
    if (!ok) {
      // Truly unexpected. We won't be able to observe IO on this Pipe.
      debug(`Failed to associate IOCP: ${ctypes.winLastError}`);
    }

    this.buffer = null;
  }

  hasPendingIO() {
    return !!this.pending.length;
  }

  maybeClose() {}

  /**
   * Closes the file handle.
   *
   * @param {boolean} [force=false]
   *        If true, the file handle is closed immediately. If false, the
   *        file handle is closed after all current pending IO operations
   *        have completed.
   *
   * @returns {Promise<void>}
   *          Resolves when the file handle has been closed.
   */
  close(force = false) {
    if (!force && this.pending.length) {
      this.closing = true;
      return this.closedPromise;
    }

    for (let { reject } of this.pending) {
      let error = new Error("File closed");
      error.errorCode = SubprocessConstants.ERROR_END_OF_FILE;
      reject(error);
    }
    this.pending.length = 0;

    this.buffer = null;

    if (!this.closed) {
      this.handle.dispose();

      io.pipes.delete(this.id);

      this.handle = null;
      this.closed = true;
      this.resolveClosed();

      io.updatePollEvents();
    }
    return this.closedPromise;
  }

  /**
   * Called when an error occurred while attempting an IO operation on our file
   * handle.
   */
  onError() {
    this.close(true);
  }
}

class InputPipe extends Pipe {
  /**
   * Queues the next chunk of data to be read from the pipe if, and only if,
   * there is no IO operation currently pending.
   */
  readNext() {
    if (this.buffer === null) {
      this.readBuffer(this.pending[0].length);
    }
  }

  /**
   * Closes the pipe if there is a pending read operation with no more
   * buffered data to be read.
   */
  maybeClose() {
    if (this.buffer) {
      let read = win32.DWORD();

      let ok = libc.GetOverlappedResult(
        this.handle,
        this.overlapped.address(),
        read.address(),
        false
      );

      if (!ok) {
        this.onError();
      }
    }
  }

  /**
   * Asynchronously reads at most `length` bytes of binary data from the file
   * descriptor into an ArrayBuffer of the same size. Returns a promise which
   * resolves when the operation is complete.
   *
   * @param {integer} length
   *        The number of bytes to read.
   *
   * @returns {Promise<ArrayBuffer>}
   */
  read(length) {
    if (this.closing || this.closed) {
      throw new Error("Attempt to read from closed pipe");
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject, length });
      this.readNext();
    });
  }

  /**
   * Initializes an overlapped IO read operation to read exactly `count` bytes
   * into a new ArrayBuffer, which is stored in the `buffer` property until the
   * operation completes.
   *
   * @param {integer} count
   *        The number of bytes to read.
   */
  readBuffer(count) {
    this.buffer = new ArrayBuffer(count);

    let ok = libc.ReadFile(
      this.handle,
      this.buffer,
      count,
      null,
      this.overlapped.address()
    );

    // TODO bug 1983138: libc.winLastError should be ctypes.winLastError
    if (!ok && (!this.process.handle || libc.winLastError)) {
      this.onError();
    } else {
      io.updatePollEvents();
    }
  }

  /**
   * Called when our pending overlapped IO operation has completed, whether
   * successfully or in failure.
   */
  onReady() {
    let read = win32.DWORD();

    let ok = libc.GetOverlappedResult(
      this.handle,
      this.overlapped.address(),
      read.address(),
      false
    );

    read = read.value;

    if (!ok) {
      this.onError();
    } else if (read > 0) {
      let buffer = this.buffer;
      this.buffer = null;

      let { resolve } = this.shiftPending();

      if (read == buffer.byteLength) {
        resolve(buffer);
      } else {
        resolve(ArrayBuffer_transfer(buffer, read));
      }

      if (this.pending.length) {
        this.readNext();
      } else {
        io.updatePollEvents();
      }
    }
  }
}

class OutputPipe extends Pipe {
  /**
   * Queues the next chunk of data to be written to the pipe if, and only if,
   * there is no IO operation currently pending.
   */
  writeNext() {
    if (this.buffer === null) {
      this.writeBuffer(this.pending[0].buffer);
    }
  }

  /**
   * Asynchronously writes the given buffer to our file descriptor, and returns
   * a promise which resolves when the operation is complete.
   *
   * @param {ArrayBuffer} buffer
   *        The buffer to write.
   *
   * @returns {Promise<integer>}
   *          Resolves to the number of bytes written when the operation is
   *          complete.
   */
  write(buffer) {
    if (this.closing || this.closed) {
      throw new Error("Attempt to write to closed pipe");
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject, buffer });
      this.writeNext();
    });
  }

  /**
   * Initializes an overapped IO read operation to write the data in `buffer` to
   * our file descriptor.
   *
   * @param {ArrayBuffer} buffer
   *        The buffer to write.
   */
  writeBuffer(buffer) {
    this.buffer = buffer;

    let ok = libc.WriteFile(
      this.handle,
      buffer,
      buffer.byteLength,
      null,
      this.overlapped.address()
    );

    // TODO bug 1983138: libc.winLastError should be ctypes.winLastError
    if (!ok && libc.winLastError) {
      this.onError();
    } else {
      io.updatePollEvents();
    }
  }

  /**
   * Called when our pending overlapped IO operation has completed, whether
   * successfully or in failure.
   */
  onReady() {
    let written = win32.DWORD();

    let ok = libc.GetOverlappedResult(
      this.handle,
      this.overlapped.address(),
      written.address(),
      false
    );

    written = written.value;

    if (!ok || written != this.buffer.byteLength) {
      this.onError();
    } else if (written > 0) {
      let { resolve } = this.shiftPending();

      this.buffer = null;
      resolve(written);

      if (this.pending.length) {
        this.writeNext();
      } else {
        io.updatePollEvents();
      }
    }
  }
}

class Process extends BaseProcess {
  constructor(...args) {
    super(...args);

    this.killed = false;
  }

  /**
   * Forcibly terminates the process.
   */
  kill() {
    this.killed = true;
    libc.TerminateJobObject(this.jobHandle, TERMINATE_EXIT_CODE);
  }

  /**
   * Initializes the IO pipes for use as standard input, output, and error
   * descriptors in the spawned process.
   *
   * @returns {win32.Handle[]}
   *          The array of file handles belonging to the spawned process.
   */
  initPipes({ stderr }) {
    let our_pipes = [];
    let their_pipes = [];

    let secAttr = new win32.SECURITY_ATTRIBUTES();
    secAttr.nLength = win32.SECURITY_ATTRIBUTES.size;
    secAttr.bInheritHandle = true;

    let pipe = input => {
      if (input) {
        let handles = win32.createPipe(secAttr, win32.FILE_FLAG_OVERLAPPED);
        our_pipes.push(new InputPipe(this, handles[0]));
        return handles[1];
      }
      let handles = win32.createPipe(secAttr, 0, win32.FILE_FLAG_OVERLAPPED);
      our_pipes.push(new OutputPipe(this, handles[1]));
      return handles[0];
    };

    their_pipes[0] = pipe(false);
    their_pipes[1] = pipe(true);

    if (stderr == "pipe") {
      their_pipes[2] = pipe(true);
    } else {
      let srcHandle;
      if (stderr == "stdout") {
        srcHandle = their_pipes[1];
      } else {
        srcHandle = libc.GetStdHandle(win32.STD_ERROR_HANDLE);
      }

      // If we don't have a valid stderr handle, just pass it along without duplicating.
      if (
        String(srcHandle) == win32.INVALID_HANDLE_VALUE ||
        String(srcHandle) == win32.NULL_HANDLE_VALUE
      ) {
        their_pipes[2] = srcHandle;
      } else {
        let handle = win32.HANDLE();

        let curProc = libc.GetCurrentProcess();
        let ok = libc.DuplicateHandle(
          curProc,
          srcHandle,
          curProc,
          handle.address(),
          0,
          true /* inheritable */,
          win32.DUPLICATE_SAME_ACCESS
        );

        their_pipes[2] = ok && win32.Handle(handle);
      }
    }

    if (!their_pipes.every(handle => handle)) {
      throw new Error("Failed to create pipe");
    }

    this.pipes = our_pipes;

    return their_pipes;
  }

  /**
   * Creates a null-separated, null-terminated string list.
   *
   * @param {Array<string>} strings
   * @returns {win32.WCHAR.array}
   */
  stringList(strings) {
    // Remove empty strings, which would terminate the list early.
    strings = strings.filter(string => string);

    let string = strings.join("\0") + "\0\0";

    return win32.WCHAR.array()(string);
  }

  /**
   * Quotes a string for use as a single command argument, using Windows quoting
   * conventions.
   *
   * @see https://msdn.microsoft.com/en-us/library/17w5ykft(v=vs.85).aspx
   *
   * @param {string} str
   *        The argument string to quote.
   * @returns {string}
   */
  quoteString(str) {
    if (!/[\s"]/.test(str)) {
      return str;
    }

    let escaped = str.replace(/(\\*)("|$)/g, (m0, m1, m2) => {
      if (m2) {
        m2 = `\\${m2}`;
      }
      return `${m1}${m1}${m2}`;
    });

    return `"${escaped}"`;
  }

  spawn(options) {
    let { command, arguments: args } = options;

    if (
      /\\cmd\.exe$/i.test(command) &&
      args.length == 3 &&
      /^(\/S)?\/C$/i.test(args[1])
    ) {
      // cmd.exe is insane and requires special treatment.
      args = [this.quoteString(args[0]), "/S/C", `"${args[2]}"`];
    } else {
      args = args.map(arg => this.quoteString(arg));
    }

    if (/\.(bat|cmd)$/i.test(command)) {
      command = io.comspec;
      args = ["cmd.exe", "/s/c", `"${args.join(" ")}"`];
    }

    let envp = this.stringList(options.environment);

    let handles = this.initPipes(options);

    let processFlags =
      win32.CREATE_NO_WINDOW |
      win32.CREATE_SUSPENDED |
      win32.CREATE_UNICODE_ENVIRONMENT;

    let startupInfoEx = new win32.STARTUPINFOEXW();
    let startupInfo = startupInfoEx.StartupInfo;

    startupInfo.cb = win32.STARTUPINFOW.size;
    startupInfo.dwFlags = win32.STARTF_USESTDHANDLES;

    startupInfo.hStdInput = handles[0];
    startupInfo.hStdOutput = handles[1];
    startupInfo.hStdError = handles[2];

    // Note: This needs to be kept alive until we destroy the attribute list.
    let handleArray = win32.HANDLE.array()(handles);

    let threadAttrs = win32.createThreadAttributeList(handleArray);
    if (threadAttrs) {
      // If have thread attributes to pass, pass the size of the full extended
      // startup info struct.
      processFlags |= win32.EXTENDED_STARTUPINFO_PRESENT;
      startupInfo.cb = win32.STARTUPINFOEXW.size;

      startupInfoEx.lpAttributeList = threadAttrs;
    }

    let procInfo = new win32.PROCESS_INFORMATION();

    let errorMessage = "Failed to create process";
    let ok = libc.CreateProcessW(
      command,
      args.join(" "),
      null /* Security attributes */,
      null /* Thread security attributes */,
      true /* Inherits handles */,
      processFlags,
      envp,
      options.workdir,
      startupInfo.address(),
      procInfo.address()
    );

    for (let handle of new Set(handles)) {
      // If any of our handles are invalid, they don't have finalizers.
      if (handle && handle.dispose) {
        handle.dispose();
      }
    }

    if (threadAttrs) {
      libc.DeleteProcThreadAttributeList(threadAttrs);
    }

    if (ok) {
      this.jobHandle = win32.Handle(libc.CreateJobObjectW(null, null));

      let info = win32.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
      info.BasicLimitInformation.LimitFlags =
        win32.JOB_OBJECT_LIMIT_BREAKAWAY_OK;

      ok = libc.SetInformationJobObject(
        this.jobHandle,
        win32.JobObjectExtendedLimitInformation,
        ctypes.cast(info.address(), ctypes.voidptr_t),
        info.constructor.size
      );
      if (!ok) {
        errorMessage = `Failed to set job limits: 0x${(
          ctypes.winLastError || 0
        ).toString(16)}`;
      }
    }

    if (ok) {
      let acp = win32.JOBOBJECT_ASSOCIATE_COMPLETION_PORT();
      acp.CompletionKey = win32.PVOID(IOCPKeyGen.keyForProcess(this));
      acp.CompletionPort = io.iocpCompletionPort;

      ok = libc.SetInformationJobObject(
        this.jobHandle,
        win32.JobObjectAssociateCompletionPortInformation,
        ctypes.cast(acp.address(), ctypes.voidptr_t),
        acp.constructor.size
      );
      if (!ok) {
        errorMessage = `Failed to set IOCP: 0x${(
          ctypes.winLastError || 0
        ).toString(16)}`;
      }
    }

    if (ok) {
      ok = libc.AssignProcessToJobObject(this.jobHandle, procInfo.hProcess);
      if (!ok) {
        errorMessage = `Failed to attach process to job object: 0x${(
          ctypes.winLastError || 0
        ).toString(16)}`;
        libc.TerminateProcess(procInfo.hProcess, TERMINATE_EXIT_CODE);
      }
    }

    if (!ok) {
      for (let pipe of this.pipes) {
        pipe.close();
      }
      throw new Error(errorMessage);
    }

    this.handle = win32.Handle(procInfo.hProcess);
    this.pid = procInfo.dwProcessId;

    libc.ResumeThread(procInfo.hThread);
    libc.CloseHandle(procInfo.hThread);
  }

  connectRunning(_options) {
    // Not relevant (yet?) on Windows. This is currently used only on Unix
    // for native messaging through the WebExtensions portal.
    throw new Error("Not implemented");
  }

  /**
   * Called when our process handle is signaled as active, meaning the process
   * has exited.
   */
  onReady() {
    this.wait();
  }

  /**
   * Attempts to wait for the process's exit status, without blocking. If
   * successful, resolves the `exitPromise` to the process's exit value.
   *
   * @returns {integer|null}
   *          The process's exit status, if it has already exited.
   */
  wait() {
    if (this.exitCode !== null) {
      return this.exitCode;
    }

    let status = win32.DWORD();

    let ok = libc.GetExitCodeProcess(this.handle, status.address());
    if (ok && status.value != win32.STILL_ACTIVE) {
      let exitCode = status.value;
      if (this.killed && exitCode == TERMINATE_EXIT_CODE) {
        // If we forcibly terminated the process, return the force kill exit
        // code that we return on other platforms.
        exitCode = -9;
      }

      this.resolveExit(exitCode);
      this.exitCode = exitCode;

      this.handle.dispose();
      this.handle = null;

      // This also terminates all child processes under this process, unless
      // the child process was created with the CREATE_BREAKAWAY_FROM_JOB flag,
      // in which case it would not be part of our job (and therefore survive).
      libc.TerminateJobObject(this.jobHandle, TERMINATE_EXIT_CODE);
      this.jobHandle.dispose();
      this.jobHandle = null;

      for (let pipe of this.pipes) {
        pipe.maybeClose();
      }

      io.updatePollEvents();

      return exitCode;
    }
  }
}

io = {
  iocpCompletionPort: null,

  pipes: new Map(),

  processes: new Map(),

  messageCount: 0,

  running: true,

  polling: false,

  init(details) {
    this.comspec = details.comspec;

    // Note: not wrapped in win32.Handle - parent thread is responsible for
    // releasing the resource when this thread terminates.
    this.iocpCompletionPort = ctypes.cast(
      ctypes.uintptr_t(details.iocpCompletionPort),
      win32.HANDLE
    );
    this.updatePollEvents();

    setTimeout(this.loop.bind(this), 0);
  },

  shutdown() {
    if (this.running) {
      this.running = false;

      self.postMessage({ msg: "close" });
      self.close();
    }
  },

  getPipe(pipeId) {
    let pipe = this.pipes.get(pipeId);

    if (!pipe) {
      let error = new Error("File closed");
      error.errorCode = SubprocessConstants.ERROR_END_OF_FILE;
      throw error;
    }
    return pipe;
  },

  getProcess(processId) {
    let process = this.processes.get(processId);

    if (!process) {
      throw new Error(`Invalid process ID: ${processId}`);
    }
    return process;
  },

  updatePollEvents() {
    let shouldPoll = false;
    for (const process of this.processes.values()) {
      // As long as the process is alive, it may notify IOCP.
      // When the process exits, process.handle is cleared by its wait(), which
      // calls updatePollEvents(), but before it is removed from io.processes.
      // To ensure that we immediately stop polling if it was the last process,
      // check if process.handle is set.
      if (process.handle) {
        shouldPoll = true;
        break;
      }
    }
    if (!shouldPoll) {
      for (let pipe of this.pipes.values()) {
        if (pipe.hasPendingIO()) {
          shouldPoll = true;
          break;
        }
      }
    }

    // Our poll loop is only useful if we've got at least 1 thing to poll other than our own
    // signal.
    if (!shouldPoll) {
      this.polling = false;
    } else if (!this.polling && this.running) {
      // Restart the poll loop if necessary:
      setTimeout(this.loop.bind(this), 0);
      this.polling = true;
    }
  },

  loop() {
    this.poll();
    if (this.running && this.polling) {
      setTimeout(this.loop.bind(this), 0);
    }
  },

  poll() {
    // On the first call, wait until any IO signaled. After that, immediately
    // process all other IO that have signaled in the meantime.
    let timeout = this.messageCount > 0 ? 0 : POLL_TIMEOUT;
    for (; ; timeout = 0) {
      let numberOfBytesTransferred = win32.DWORD();
      let completionKeyOut = win32.ULONG_PTR();
      let lpOverlapped = win32.OVERLAPPED.ptr(0);
      let ok = libc.GetQueuedCompletionStatus(
        io.iocpCompletionPort,
        numberOfBytesTransferred.address(),
        completionKeyOut.address(),
        lpOverlapped.address(),
        timeout
      );

      const deqWinErr = ok ? 0 : ctypes.winLastError;
      if (!ok) {
        if (deqWinErr === win32.WAIT_TIMEOUT) {
          // No changes, return (caller may schedule another loop/poll).
          break;
        }
        if (deqWinErr === win32.ERROR_ABANDONED_WAIT_0) {
          // iocpCompletionPort was closed.
          io.shutdown();
          break;
        }
        if (lpOverlapped.isNull()) {
          // "If *lpOverlapped is NULL, the function did not dequeue a
          // completion packet from the completion port."
          // No remaining data, return (caller may schedule another loop/poll).
          break;
        }
        // Received completion packet that failed, fall through.
      }
      let completionKey = parseInt(completionKeyOut.value, 10);
      if (completionKey === win32.IOCP_COMPLETION_KEY_WAKE_WORKER) {
        // Custom notification from the parent thread.
        io.messageCount += 1;
        // Continue to process any completed IO, then return (and eventually
        // yield to the event loop to allow onmessage to receive messages).
        continue;
      }
      if (IOCPKeyGen.isPipeKey(completionKey)) {
        const pipeId = IOCPKeyGen.pipeIdFromKey(completionKey);
        const pipe = io.pipes.get(pipeId);
        if (!pipe) {
          debug(`IOCP notification for unknown pipe: ${pipeId}`);
          continue;
        }
        if (deqWinErr === win32.ERROR_BROKEN_PIPE) {
          pipe.onError();
          continue;
        }
        try {
          pipe.onReady();
        } catch (e) {
          console.error(e);
          debug(`Worker error: ${e} :: ${e.stack}`);
          pipe.onError();
        }
      } else if (IOCPKeyGen.isProcessKey(completionKey)) {
        // This is a notification via JOBOBJECT_ASSOCIATE_COMPLETION_PORT.
        // "numberOfBytesTransferred" is any of the JOB_OBJECT_MSG_* values.
        // https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_associate_completion_port
        const jobMsgId = numberOfBytesTransferred.value;
        const processId = IOCPKeyGen.processIdFromKey(completionKey);

        // The job reaching process count zero is a very strong indication that
        // the process has exit. We also listen to the other *EXIT_PROCESS
        // messages in case the process spawned child processes under the job,
        // because that would suppress the JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO
        // notification and prevent us from detecting process termination.
        const isExit =
          jobMsgId === win32.JOB_OBJECT_MSG_ABNORMAL_EXIT_PROCESS ||
          jobMsgId === win32.JOB_OBJECT_MSG_EXIT_PROCESS;
        const isJobZero = jobMsgId === win32.JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO;
        if (!isExit && !isJobZero) {
          // Ignore non-exit notifications, such as additional new processes.
          continue;
        }
        const process = io.processes.get(processId);
        if (!process) {
          // This may happen when isJobZero == true, because we could have
          // observed isExit == true before.
          continue;
        }
        if (isExit) {
          let realPid = ctypes.cast(lpOverlapped, win32.DWORD).value;
          if (process.pid !== realPid) {
            // A random child process (spawned by the process) has exited.
            continue;
          }
        }
        try {
          process.onReady();
        } catch (e) {
          // This is really unexpected, but don't break the poll loop.
          console.error(e);
          debug(`Worker error: ${e} :: ${e.stack}`);
        }
      } else {
        debug(`Unexpected IOCP CompletionKey: ${completionKey}`);
      }
    }
  },

  addProcess(process) {
    this.processes.set(process.id, process);

    for (let pipe of process.pipes) {
      this.pipes.set(pipe.id, pipe);
    }
  },

  cleanupProcess(process) {
    this.processes.delete(process.id);
  },
};
