/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_MACOS_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_MACOS_H_

#ifdef XP_MACOSX
#  include "mozilla/Sprintf.h"

#  include <algorithm>
#  include <array>
#  include <cerrno>
#  include <cmath>
#  include <cstdint>
#  include <cstdio>
#  include <cstdlib>
#  include <cstring>
#  include <mutex>
#  include <string>
#  include <utility>
#  include <vector>

#  include <bsm/libbsm.h>
#  include <crt_externs.h>
#  include <fcntl.h>
#  include <mach/mach.h>
#  include <mach/mach_time.h>
#  include <mach-o/dyld.h>
#  include <poll.h>
#  include <servers/bootstrap.h>
#  include <spawn.h>
#  include <sys/select.h>
#  include <sys/socket.h>
#  include <sys/sysctl.h>
#  include <sys/wait.h>
#  include <unistd.h>

namespace mozilla::midori {

int RunManagedMacCpuHelper(int aArgc, char** aArgv);

struct MacCpuBudgetState {
  uint32_t requestedPercentage = 0;
  double externalCapacityCpus = 0;
  double ownQuotaCpus = 0;
  double effectiveCapacityCpus = 0;
  double quotaQuantumCpus = 0;
};

class MacCpuBudget final {
  enum class Command : uint32_t { Hello, Attach, Detach, Configure, Ack };

  struct Message {
    mach_msg_header_t header{};
    mach_msg_body_t body{};
    mach_msg_port_descriptor_t ports[2]{};
    uint64_t sequence = 0;
    uintptr_t identity = 0;
    double capacity = 0;
    double quota = 0;
    uint32_t pid = 0;
    Command command = Command::Ack;
    int error = 0;
    bool chargeStartup = false;
  };

  struct Received {
    alignas(8) std::array<
        unsigned char, sizeof(Message) + sizeof(mach_msg_max_trailer_t)> data{};
    bool owned = false;
    Message& Get() { return *reinterpret_cast<Message*>(data.data()); }
    const mach_msg_audit_trailer_t& Audit() const {
      return *reinterpret_cast<const mach_msg_audit_trailer_t*>(
          data.data() + ((sizeof(Message) + 3) & ~size_t(3)));
    }
    ~Received() {
      if (owned) mach_msg_destroy(&Get().header);
    }
  };

  struct Task {
    uintptr_t identity;
    uint32_t pid;
    mach_port_t port;
    mach_port_t suspension = MACH_PORT_NULL;
    double cpu = 0;

    int Resume() {
      if (suspension == MACH_PORT_NULL) return 0;
      const mach_port_t token = std::exchange(suspension, MACH_PORT_NULL);
      kern_return_t error = task_resume2(token);
      if (error) mach_port_deallocate(mach_task_self(), token);
      return error;
    }

    int Suspend() {
      return suspension != MACH_PORT_NULL ? 0
                                          : task_suspend2(port, &suspension);
    }

    void Release() {
      Resume();
      if (port != MACH_PORT_NULL) mach_port_deallocate(mach_task_self(), port);
      port = MACH_PORT_NULL;
    }
  };

 public:
  MacCpuBudget() = default;
  MacCpuBudget(const MacCpuBudget&) = delete;
  MacCpuBudget& operator=(const MacCpuBudget&) = delete;
  ~MacCpuBudget() { Shutdown(); }

  int Initialize() {
    std::lock_guard lock(mMutex);
    if (mOwner) return EALREADY;
    double capacity;
    int error = Capacity(capacity);
    if (error) return error;
    mOwner = getpid();
    mAdmissionError = 0;
    mTasks.push_back({0, uint32_t(mOwner), mach_task_self()});
    return 0;
  }

  int SetPercentage(uint32_t aPercentage, MacCpuBudgetState& aState) {
    std::lock_guard lock(mMutex);
    aState = {};
    aState.requestedPercentage = aPercentage;
    if (aPercentage > 100) return EINVAL;
    if (!mOwner || mOwner != getpid()) return EPERM;
    if (mHelper > 0 && !HelperAlive()) {
      int failure = 0;
      if (read(mWake, &failure, sizeof(failure)) != sizeof(failure) || !failure)
        failure = ESRCH;
      mFailedPercentage = mPercentage;
      mRuntimeError = failure;
      StopHelper();
    }
    if (aPercentage && aPercentage < 100 && aPercentage == mFailedPercentage)
      return mRuntimeError;
    mFailedPercentage = 0;
    mRuntimeError = 0;
    if (!aPercentage || aPercentage == 100) StopHelper();
    double capacity;
    int error = Capacity(capacity);
    if (!error && aPercentage && aPercentage < 100) {
      if (mAdmissionError) return mAdmissionError;
      error = StartHelper();
      if (!error) {
        Message request;
        request.command = Command::Configure;
        request.capacity = capacity;
        request.quota = capacity * aPercentage / 100;
        error = Exchange(request);
      }
    }
    if (error) {
      StopHelper();
      mFailedPercentage = aPercentage;
      mRuntimeError = error;
      return error;
    }
    mPercentage = aPercentage;
    aState.externalCapacityCpus = capacity;
    aState.ownQuotaCpus = aPercentage ? capacity * aPercentage / 100 : 0;
    aState.effectiveCapacityCpus = aPercentage ? aState.ownQuotaCpus : capacity;
    aState.quotaQuantumCpus =
        aPercentage && aPercentage < 100 ? capacity * .005 : 0;
    return 0;
  }

  int ReadExternalCapacity(double& aCapacity) const {
    std::lock_guard lock(mMutex);
    if (!mOwner || mOwner != getpid()) return EPERM;
    if (mPercentage && mPercentage < 100 && !HelperAlive()) return ESRCH;
    return Capacity(aCapacity);
  }

  int Attach(uintptr_t aIdentity, uint32_t aPid, mach_port_t aTask) {
    std::lock_guard lock(mMutex);
    if (!mOwner || mOwner != getpid()) return EPERM;
    pid_t pid = 0;
    int error = pid_for_task(aTask, &pid);
    if (error && DeadTask(aTask)) return 0;
    if (!aIdentity || error || pid != pid_t(aPid)) {
      mAdmissionError = error ? error : EINVAL;
      StopHelper();
      return mAdmissionError;
    }
    for (const auto& task : mTasks) {
      if (task.identity == aIdentity)
        return task.pid == aPid && task.port == aTask ? 0 : EEXIST;
    }
    error =
        mach_port_mod_refs(mach_task_self(), aTask, MACH_PORT_RIGHT_SEND, 1);
    if (error) {
      mAdmissionError = error;
      StopHelper();
      return error;
    }
    mTasks.push_back({aIdentity, aPid, aTask});
    if (mHelper > 0) {
      error = SendTask(mTasks.back(), mPercentage > 0);
      if (error) {
        mAdmissionError = error;
        StopHelper();
      }
    }
    return error;
  }

  int Detach(uintptr_t aIdentity) {
    std::lock_guard lock(mMutex);
    if (!aIdentity) return EINVAL;
    for (auto task = mTasks.begin(); task != mTasks.end(); ++task) {
      if (task->identity != aIdentity) continue;
      int error = 0;
      if (mHelper > 0) {
        Message request;
        request.command = Command::Detach;
        request.identity = aIdentity;
        error = Exchange(request);
      }
      mach_port_deallocate(mach_task_self(), task->port);
      mTasks.erase(task);
      if (error) StopHelper();
      return error;
    }
    return 0;
  }

  int SetWorkerRole(uintptr_t, uint32_t, uint64_t, bool, bool) {
    return ENOTSUP;
  }

  int Shutdown() {
    std::lock_guard lock(mMutex);
    if (!mOwner) return 0;
    StopHelper();
    for (auto& task : mTasks) {
      if (task.identity) mach_port_deallocate(mach_task_self(), task.port);
    }
    mTasks.clear();
    mOwner = 0;
    return 0;
  }

  static bool MaybeRunHelper(int aArgc, char** aArgv, int& aResult) {
    if (aArgc < 2 || strcmp(aArgv[1], "--midori-cpu-controller-macos"))
      return false;
    aResult = 255;
    if (aArgc != 4) return true;
    char* end = nullptr;
    errno = 0;
    const long parent = strtol(aArgv[3], &end, 10);
    if (errno || !end || *end || parent <= 1 || parent != getppid())
      return true;
    aResult = RunHelper(aArgv[2], pid_t(parent));
    return true;
  }

 private:
  static double Now() {
    timespec value{};
    if (clock_gettime(CLOCK_MONOTONIC, &value)) return -1;
    return double(value.tv_sec) + double(value.tv_nsec) / 1e9;
  }

  static int Capacity(double& aCapacity) {
    uint32_t cpus = 0;
    size_t size = sizeof(cpus);
    if (sysctlbyname("hw.activecpu", &cpus, &size, nullptr, 0) || !cpus ||
        size != sizeof(cpus))
      return errno ? errno : EINVAL;
    aCapacity = cpus;
    return 0;
  }

  static bool DeadTask(mach_port_t aTask) {
    mach_port_type_t type = 0;
    return !mach_port_type(mach_task_self(), aTask, &type) &&
           (type & MACH_PORT_TYPE_DEAD_NAME);
  }

#  pragma clang diagnostic push
#  pragma clang diagnostic ignored "-Wdeprecated-declarations"
  static kern_return_t RegisterService(char* aName, mach_port_t aPort) {
    return bootstrap_register(bootstrap_port, aName, aPort);
  }
#  pragma clang diagnostic pop

  static int CpuSeconds(mach_port_t aTask, double& aCpu) {
    task_power_info_data_t value{};
    mach_msg_type_number_t count = TASK_POWER_INFO_COUNT;
    kern_return_t error = task_info(
        aTask, TASK_POWER_INFO, reinterpret_cast<task_info_t>(&value), &count);
    if (error) return error;
    mach_timebase_info_data_t timebase{};
    error = mach_timebase_info(&timebase);
    if (error || !timebase.denom) return error ? error : EINVAL;
    aCpu = double(
        (static_cast<long double>(value.total_user) + value.total_system) *
        timebase.numer / timebase.denom / 1e9L);
    return 0;
  }

  static int MakeReceivePort(mach_port_t& aPort) {
    kern_return_t error =
        mach_port_allocate(mach_task_self(), MACH_PORT_RIGHT_RECEIVE, &aPort);
    if (!error)
      error = mach_port_insert_right(mach_task_self(), aPort, aPort,
                                     MACH_MSG_TYPE_MAKE_SEND);
    if (error && aPort != MACH_PORT_NULL) {
      mach_port_destroy(mach_task_self(), aPort);
      aPort = MACH_PORT_NULL;
    }
    return error;
  }

  static int Receive(mach_port_t aPort, pid_t aSender, Received& aReceived,
                     mach_msg_timeout_t aTimeout) {
    auto& message = aReceived.Get();
    kern_return_t error =
        mach_msg(&message.header,
                 MACH_RCV_MSG | MACH_RCV_TIMEOUT |
                     MACH_RCV_TRAILER_TYPE(MACH_MSG_TRAILER_FORMAT_0) |
                     MACH_RCV_TRAILER_ELEMENTS(MACH_RCV_TRAILER_AUDIT),
                 0, aReceived.data.size(), aPort, aTimeout, MACH_PORT_NULL);
    if (error) return error;
    aReceived.owned = true;
    const auto& trailer = aReceived.Audit();
    if (message.header.msgh_size != sizeof(Message) ||
        trailer.msgh_trailer_type != MACH_MSG_TRAILER_FORMAT_0 ||
        trailer.msgh_trailer_size < sizeof(mach_msg_audit_trailer_t) ||
        audit_token_to_pid(trailer.msgh_audit) != aSender ||
        audit_token_to_euid(trailer.msgh_audit) != geteuid())
      return EPERM;
    return 0;
  }

  static int Reply(Message& aRequest, int aError) {
    Message reply;
    reply.header.msgh_bits = MACH_MSGH_BITS(MACH_MSG_TYPE_MOVE_SEND_ONCE, 0);
    reply.header.msgh_remote_port = aRequest.header.msgh_remote_port;
    reply.header.msgh_size = sizeof(reply);
    reply.sequence = aRequest.sequence;
    reply.error = aError;
    kern_return_t error =
        mach_msg(&reply.header, MACH_SEND_MSG | MACH_SEND_TIMEOUT,
                 sizeof(reply), 0, MACH_PORT_NULL, 100, MACH_PORT_NULL);
    if (!error) aRequest.header.msgh_remote_port = MACH_PORT_NULL;
    return error;
  }

  int SendTask(const Task& aTask, bool aStartup) {
    Message request;
    request.command = Command::Attach;
    request.identity = aTask.identity;
    request.pid = aTask.pid;
    request.chargeStartup = aStartup;
    request.body.msgh_descriptor_count = 1;
    request.ports[0].name = aTask.port;
    request.ports[0].type = MACH_MSG_PORT_DESCRIPTOR;
    request.ports[0].disposition = MACH_MSG_TYPE_COPY_SEND;
    return Exchange(request);
  }

  int Exchange(Message& aRequest) {
    if (!HelperAlive()) return ESRCH;
    aRequest.sequence = ++mSequence;
    aRequest.header.msgh_size = sizeof(aRequest);
    aRequest.header.msgh_remote_port = mRemote;
    aRequest.header.msgh_local_port = mReceive;
    aRequest.header.msgh_bits =
        MACH_MSGH_BITS(MACH_MSG_TYPE_COPY_SEND, MACH_MSG_TYPE_MAKE_SEND_ONCE) |
        (aRequest.body.msgh_descriptor_count ? MACH_MSGH_BITS_COMPLEX : 0);
    kern_return_t error =
        mach_msg(&aRequest.header, MACH_SEND_MSG | MACH_SEND_TIMEOUT,
                 sizeof(aRequest), 0, MACH_PORT_NULL, 100, MACH_PORT_NULL);
    if (error) return error;
    const char wake = 1;
    if (write(mWake, &wake, 1) != 1 && errno != EAGAIN) return errno;
    const double deadline = Now() + 1;
    while (Now() < deadline) {
      Received response;
      error = Receive(mReceive, mHelper, response, 100);
      if (error == MACH_RCV_TIMED_OUT || error == EPERM) continue;
      if (error) return error;
      if (response.Get().sequence == aRequest.sequence)
        return response.Get().error;
    }
    return ETIMEDOUT;
  }

  bool HelperAlive() const {
    if (mHelper <= 0 || mRemote == MACH_PORT_NULL || mWake < 0) return false;
    mach_port_type_t type = 0;
    pollfd wake{mWake, POLLIN, 0};
    return !mach_port_type(mach_task_self(), mRemote, &type) &&
           (type & MACH_PORT_TYPE_SEND) && poll(&wake, 1, 0) >= 0 &&
           !(wake.revents & (POLLHUP | POLLERR | POLLNVAL));
  }

  int StartHelper() {
    if (HelperAlive()) return 0;
    StopHelper();
    int error = MakeReceivePort(mReceive);
    if (error) return error;
    char service[96];
    uint64_t random[2];
    arc4random_buf(random, sizeof(random));
    SprintfLiteral(service, "org.astian.midori.cpu.%016llx%016llx",
                   static_cast<unsigned long long>(random[0]),
                   static_cast<unsigned long long>(random[1]));
    error = RegisterService(service, mReceive);
    if (error) {
      StopHelper();
      return error;
    }
    int pair[2] = {-1, -1};
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, pair)) error = errno;
    if (!error) {
      for (int fd : pair) {
        int enabled = 1;
        if (fcntl(fd, F_SETFD, FD_CLOEXEC) || fcntl(fd, F_SETFL, O_NONBLOCK) ||
            setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &enabled,
                       sizeof(enabled))) {
          error = errno;
          break;
        }
      }
    }
    char executable[4096];
    uint32_t length = sizeof(executable);
    if (!error && _NSGetExecutablePath(executable, &length))
      error = ENAMETOOLONG;
    if (!error) {
      posix_spawn_file_actions_t files;
      posix_spawnattr_t attributes;
      error = posix_spawn_file_actions_init(&files);
      if (!error) {
        error = posix_spawnattr_init(&attributes);
        if (!error) {
          cpu_type_t architecture =
#  ifdef __x86_64__
              CPU_TYPE_X86_64;
#  else
              CPU_TYPE_ARM64;
#  endif
          size_t accepted = 0;
          error = posix_spawnattr_setbinpref_np(&attributes, 1, &architecture,
                                                &accepted);
          if (!error && accepted != 1) error = ENOTSUP;
          if (!error)
            error = posix_spawnattr_setflags(&attributes,
                                             POSIX_SPAWN_CLOEXEC_DEFAULT);
          if (!error)
            error = posix_spawn_file_actions_addclose(&files, pair[0]);
          if (!error)
            error = posix_spawn_file_actions_adddup2(&files, pair[1], 3);
          if (!error && pair[1] != 3)
            error = posix_spawn_file_actions_addclose(&files, pair[1]);
          std::string owner = std::to_string(mOwner);
          char* arguments[] = {
              executable, const_cast<char*>("--midori-cpu-controller-macos"),
              service, owner.data(), nullptr};
          if (!error)
            error = posix_spawn(&mHelper, executable, &files, &attributes,
                                arguments, *_NSGetEnviron());
          posix_spawnattr_destroy(&attributes);
        }
        posix_spawn_file_actions_destroy(&files);
      }
    }
    if (pair[1] >= 0) close(pair[1]);
    mWake = pair[0];
    if (!error) {
      Received hello;
      error = Receive(mReceive, mHelper, hello, 1000);
      auto& message = hello.Get();
      pid_t helperPid = 0;
      if (!error && (message.command != Command::Hello ||
                     !(message.header.msgh_bits & MACH_MSGH_BITS_COMPLEX) ||
                     message.body.msgh_descriptor_count != 2 ||
                     message.ports[0].type != MACH_MSG_PORT_DESCRIPTOR ||
                     message.ports[1].type != MACH_MSG_PORT_DESCRIPTOR ||
                     message.ports[0].disposition != MACH_MSG_TYPE_PORT_SEND ||
                     message.ports[1].disposition != MACH_MSG_TYPE_PORT_SEND ||
                     pid_for_task(message.ports[1].name, &helperPid) ||
                     helperPid != mHelper))
        error = EPERM;
      if (!error) {
        mRemote = std::exchange(message.ports[0].name, MACH_PORT_NULL);
        mHelperTask = std::exchange(message.ports[1].name, MACH_PORT_NULL);
        error = Reply(message, 0);
      }
    }
    static_cast<void>(RegisterService(service, MACH_PORT_NULL));
    if (!error) {
      for (auto task = mTasks.begin(); task != mTasks.end();) {
        if (task->identity && DeadTask(task->port)) {
          mach_port_deallocate(mach_task_self(), task->port);
          task = mTasks.erase(task);
          continue;
        }
        error = SendTask(*task, false);
        if (error) break;
        ++task;
      }
    }
    if (error) StopHelper();
    return error;
  }

  void StopHelper() {
    if (mWake >= 0) close(std::exchange(mWake, -1));
    if (mHelper > 0) {
      for (int attempt = 0; attempt < 200; ++attempt) {
        int status;
        pid_t result = waitpid(mHelper, &status, WNOHANG);
        if (result == mHelper || (result < 0 && errno == ECHILD)) break;
        if (attempt == 100 && mHelperTask != MACH_PORT_NULL)
          static_cast<void>(task_terminate(mHelperTask));
        timespec delay{0, 1000000};
        nanosleep(&delay, nullptr);
      }
    }
    mHelper = -1;
    mPercentage = 0;
    for (mach_port_t* port : {&mRemote, &mHelperTask}) {
      if (*port != MACH_PORT_NULL)
        mach_port_deallocate(mach_task_self(), *port);
      *port = MACH_PORT_NULL;
    }
    if (mReceive != MACH_PORT_NULL)
      mach_port_destroy(mach_task_self(), mReceive);
    mReceive = MACH_PORT_NULL;
  }

  static int RunHelper(const char* aService, pid_t aParent) {
    uid_t uid, gid;
    if (getpeereid(3, &uid, &gid) || uid != geteuid()) return EPERM;
    mach_port_t parent = MACH_PORT_NULL, receive = MACH_PORT_NULL;
    int error =
        bootstrap_look_up(bootstrap_port, const_cast<char*>(aService), &parent);
    if (!error) error = MakeReceivePort(receive);
    if (error) return error;
    Message hello;
    hello.command = Command::Hello;
    hello.header.msgh_bits =
        MACH_MSGH_BITS(MACH_MSG_TYPE_COPY_SEND, MACH_MSG_TYPE_MAKE_SEND_ONCE) |
        MACH_MSGH_BITS_COMPLEX;
    hello.header.msgh_remote_port = parent;
    hello.header.msgh_local_port = receive;
    hello.header.msgh_size = sizeof(hello);
    hello.body.msgh_descriptor_count = 2;
    for (int index = 0; index < 2; ++index) {
      hello.ports[index].name = index ? mach_task_self() : receive;
      hello.ports[index].type = MACH_MSG_PORT_DESCRIPTOR;
      hello.ports[index].disposition = MACH_MSG_TYPE_COPY_SEND;
    }
    error = mach_msg(&hello.header, MACH_SEND_MSG | MACH_SEND_TIMEOUT,
                     sizeof(hello), 0, MACH_PORT_NULL, 1000, MACH_PORT_NULL);
    if (error) return error;
    Received acknowledgement;
    error = Receive(receive, aParent, acknowledgement, 1000);
    if (error) return error;
    std::vector<Task> tasks;
    double quota = 0, capacity = 0, balance = 0, lastWall = Now(), ownCpu = 0;
    double pauseBegan = 0;
    error = CpuSeconds(mach_task_self(), ownCpu);
    while (!error) {
      for (int count = 0; count < 64; ++count) {
        Received incoming;
        int received = Receive(receive, aParent, incoming, 0);
        if (received == MACH_RCV_TIMED_OUT) break;
        if (received == EPERM) continue;
        if (received) {
          error = received;
          break;
        }
        auto& request = incoming.Get();
        int result = 0;
        if (request.command == Command::Attach &&
            (request.header.msgh_bits & MACH_MSGH_BITS_COMPLEX) &&
            request.body.msgh_descriptor_count == 1 &&
            request.ports[0].type == MACH_MSG_PORT_DESCRIPTOR &&
            request.ports[0].disposition == MACH_MSG_TYPE_PORT_SEND) {
          pid_t pid = 0;
          double cpu = 0;
          result = pid_for_task(request.ports[0].name, &pid);
          if (!result && (pid != pid_t(request.pid) || pid == getpid()))
            result = EPERM;
          if (!result) result = CpuSeconds(request.ports[0].name, cpu);
          if (!result) {
            Task task{request.identity, request.pid, request.ports[0].name};
            result = task.Suspend();
            if (!result) result = task.Resume();
            if (!result) {
              task.cpu = request.chargeStartup ? 0 : cpu;
              request.ports[0].name = MACH_PORT_NULL;
              tasks.push_back(task);
            }
          }
        } else if (request.command == Command::Detach) {
          for (auto task = tasks.begin(); task != tasks.end(); ++task) {
            if (task->identity == request.identity) {
              task->Release();
              tasks.erase(task);
              break;
            }
          }
        } else if (request.command == Command::Configure &&
                   std::isfinite(request.capacity) &&
                   std::isfinite(request.quota) && request.capacity > 0 &&
                   request.quota > 0 && request.quota <= request.capacity) {
          if (!quota) {
            balance = 0;
            lastWall = Now();
            result = CpuSeconds(mach_task_self(), ownCpu);
            for (auto& task : tasks) {
              if (result) break;
              result = CpuSeconds(task.port, task.cpu);
            }
          }
          quota = request.quota;
          capacity = request.capacity;
          balance = std::min(balance, quota * .02);
        } else {
          result = EINVAL;
        }
        if (Reply(request, result)) {
          error = EPIPE;
          break;
        }
        if (result) {
          error = result;
          break;
        }
      }
      if (error) break;
      double delay = .1;
      if (quota > 0) {
        const double now = Now(), elapsed = now - lastWall;
        if (now < 0 || elapsed < 0) {
          error = EIO;
          break;
        }
        double cpu = 0, used = 0;
        error = CpuSeconds(mach_task_self(), cpu);
        if (error) break;
        used = std::max(0.0, cpu - ownCpu);
        ownCpu = cpu;
        double applicationUsed = 0;
        bool unknownRunningTask = false;
        for (auto task = tasks.begin(); task != tasks.end();) {
          int reading = CpuSeconds(task->port, cpu);
          if (reading) {
            if (!DeadTask(task->port)) {
              error = reading;
              break;
            }
            unknownRunningTask |= task->suspension == MACH_PORT_NULL;
            task->Release();
            task = tasks.erase(task);
          } else {
            const double taskUsed = std::max(0.0, cpu - task->cpu);
            used += taskUsed;
            applicationUsed += taskUsed;
            task->cpu = cpu;
            ++task;
          }
        }
        if (error) break;
        if (unknownRunningTask) used = std::max(used, capacity * elapsed);
        balance = std::min(quota * .02, balance + elapsed * quota - used);
        lastWall = now;
        if (balance < 0) {
          if (!pauseBegan) pauseBegan = now;
          if (now - pauseBegan >= .25) {
            error = EAGAIN;
            break;
          }
        } else {
          pauseBegan = 0;
        }
        for (auto task = tasks.begin(); task != tasks.end();) {
          error = balance < 0 ? task->Suspend() : task->Resume();
          if (error && DeadTask(task->port)) {
            task->Release();
            task = tasks.erase(task);
            error = 0;
          } else {
            if (error) break;
            ++task;
          }
        }
        if (error) break;
        delay = balance < 0 ? std::min(.01, -balance / quota)
                : applicationUsed < .00001
                    ? std::clamp(quota / capacity * .2, .001, .05)
                    : std::clamp(balance / capacity, .0001, .005);
      }
      fd_set readable;
      FD_ZERO(&readable);
      FD_SET(3, &readable);
      timespec wait{0, long(std::clamp(delay, .0001, .1) * 1e9)};
      int ready = pselect(4, &readable, nullptr, nullptr, &wait, nullptr);
      if (ready < 0 && errno != EINTR) {
        error = errno;
        break;
      }
      if (ready > 0) {
        char bytes[128];
        ssize_t readBytes;
        do {
          readBytes = read(3, bytes, sizeof(bytes));
        } while (readBytes > 0);
        if (!readBytes) break;
        if (errno != EAGAIN && errno != EINTR) {
          error = errno;
          break;
        }
      }
    }
    for (auto& task : tasks) task.Release();
    if (error) static_cast<void>(write(3, &error, sizeof(error)));
    mach_port_destroy(mach_task_self(), receive);
    mach_port_deallocate(mach_task_self(), parent);
    close(3);
    return error;
  }

  mutable std::mutex mMutex;
  std::vector<Task> mTasks;
  pid_t mOwner = 0;
  pid_t mHelper = -1;
  mach_port_t mReceive = MACH_PORT_NULL;
  mach_port_t mRemote = MACH_PORT_NULL;
  mach_port_t mHelperTask = MACH_PORT_NULL;
  int mWake = -1;
  int mAdmissionError = 0;
  uint32_t mPercentage = 0;
  uint32_t mFailedPercentage = 0;
  int mRuntimeError = 0;
  uint64_t mSequence = 0;
};

}  // namespace mozilla::midori
#endif
#endif
