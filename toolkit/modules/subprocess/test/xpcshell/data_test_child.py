#!/usr/bin/env python3

# This file is run by test_subprocess_child.js. To test this file in isolation:
# python3 -u toolkit/modules/subprocess/test/xpcshell/data_test_child.py spawn_child_and_exit
# Then separately, to the displayed URL "Listening at http://127.0.0.1:12345",
# with 12345 being a random port,
# curl http://127.0.0.1:12345 -X DELETE  # request exit of parent
# curl http://127.0.0.1:12345            # request exit of child

import sys
import time


def sleep_for_a_little_bit():
    time.sleep(0.2)


def spawn_child_and_exit(is_breakaway_job):
    """
    Spawns and exits child processes to allow tests to verify that they detect
    specifically the exit of this (parent) process.

    The expected sequence of outputs is as follows:
    1. parent_start
    2. first_child_start_and_exit
    3. parent_after_first_child_exit
    4. spawned_child_start
    5. Listening at http://127.0.0.1:12345  - with 12345 being random port
    6. child_received_http_request          - DELETE request from test.
    7. data_from_child:kill_parent
    8. parent_exit
       ( now the parent has exit)
       ( child_process_still_alive_1 response sent to request from step 6)
       ( wait for new request from client to request child to exit )
       ( child_process_still_alive_2 response sent to that new request )
    9. spawned_child_exit
    """
    import subprocess

    print("1. parent_start", flush=True)

    # Start and exit a child process (used to make sure that we do not
    # mistakenly detect an exited child process for the parent process).
    subprocess.run(
        [sys.executable, "-c", "print('2. first_child_start_and_exit')"],
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    # Wait a bit to make sure that the child's exit signal has been processed.
    # This is not strictly needed, because we don't expect the child to affect
    # the parent, but in case of a flawed implementation, this would enable the
    # test to detect a bad implementation (by observing the exit before the
    # "parent_after_first_child_exit" message below).
    sleep_for_a_little_bit()
    print("3. parent_after_first_child_exit", flush=True)

    creationflags = 0
    if is_breakaway_job:
        # See comment in test_subprocess_child.js; in short we need this flag
        # to make sure that the child outlives the parent when the subprocess
        # implementation calls TerminateJobObject.
        creationflags = subprocess.CREATE_BREAKAWAY_FROM_JOB
    child_proc = subprocess.Popen(
        [sys.executable, "-u", __file__, "spawned_child"],
        creationflags=creationflags,
        # We don't need this pipe, but when this side of the process exits,
        # the pipe is closed, which the child can use to detect that the parent
        # has exit.
        stdin=subprocess.PIPE,
        # We are using stdout as a control channel to allow the child to
        # notify us when the process is done.
        stdout=subprocess.PIPE,
        # stderr is redirected to the real stdout, so that the caller can
        # still observe print() from spawned_child.
        stderr=sys.stdout,
    )

    # This blocks until the child has notified us.
    data_from_child = child_proc.stdout.readline().decode().rstrip()
    print(f"7. data_from_child:{data_from_child}", flush=True)
    print("8. parent_exit", flush=True)

    # Wait a little bit to make sure that stdout has been flushed (and read by
    # the caller) when the process exits.
    sleep_for_a_little_bit()
    sys.exit(0)


def spawned_child():
    import http.server
    import socketserver

    def print_to_parent_stdout(msg):
        # The parent maps our stderr to its stdout.
        print(msg, flush=True, file=sys.stderr)

    # This is spawned via spawn_child_and_exit.
    print_to_parent_stdout("4. spawned_child_start")

    class RequestHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Disable logging

        def do_DELETE(self):
            print_to_parent_stdout("6. child_received_http_request")
            # Let the caller know that we are responsive.
            self.send_response(200)
            self.send_header("Connection", "close")
            self.end_headers()

            # Wait a little bit to allow the network request to be
            # processed by the client. If for some reason the termination
            # of the parent also kills the child, then at least the client
            # has had a chance to become aware of it.
            sleep_for_a_little_bit()

            # Now ask the parent to exit, and continue here.
            print("kill_parent", flush=True)
            # When the parent exits, stdin closes, which we detect here:
            res = sys.stdin.read(1)
            if len(res):
                print_to_parent_stdout("spawned_child_UNEXPECTED_STDIN")

            # If we make it here, it means that this child outlived the
            # parent, and we can let the client know.
            # (if the child process is terminated prematurely, the client
            # would also know through a disconnected socket).
            self.wfile.write(b"child_process_still_alive_1")

        def do_GET(self):
            self.send_response(200)
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(b"child_process_still_alive_2")

    # Starts a server that handles two requests and then closes the server.
    with socketserver.TCPServer(("127.0.0.1", 0), RequestHandler) as server:
        host, port = server.server_address[:2]
        print_to_parent_stdout(f"5. Listening at http://{host}:{port}")

        # Expecting DELETE request (do_DELETE)
        server.handle_request()

        # Expecting GET request (do_GET)
        server.handle_request()

    print_to_parent_stdout("9. spawned_child_exit")
    sys.exit(0)


cmd = sys.argv[1]
if cmd == "spawn_child_and_exit":
    spawn_child_and_exit(is_breakaway_job=False)
elif cmd == "spawn_child_in_breakaway_job_and_exit":
    spawn_child_and_exit(is_breakaway_job=True)
elif cmd == "spawned_child":
    spawned_child()
else:
    raise Exception(f"Unknown command: {cmd}")
