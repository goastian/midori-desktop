/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <Foundation/Foundation.h>

#include "mozilla/MidoriCpuBudget_macos.h"

namespace mozilla::midori {

int RunManagedMacCpuHelper(int aArgc, char** aArgv) {
  @autoreleasepool {
    NSProcessInfo* process = [NSProcessInfo processInfo];
    id activity = [process
        beginActivityWithOptions:NSActivityUserInitiatedAllowingIdleSystemSleep
                          reason:@"Managing Midori CPU budget"];
    if (!activity) return ENOTSUP;
    int result = EINVAL;
    MacCpuBudget::MaybeRunHelper(aArgc, aArgv, result);
    [process endActivity:activity];
    return result;
  }
}

}  // namespace mozilla::midori
