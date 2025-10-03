/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::ffi::CStr;

use crate::{errors::IPCError, Pid};

pub struct IPCListener {}

impl IPCListener {
    /// Create a new dummy listener. This is not used on Linux and macOS but
    /// we keep the type around so that the shared logic is the same as for
    /// Windows where this type is used.
    pub fn new(_pid: Pid) -> Result<IPCListener, IPCError> {
        Ok(IPCListener {})
    }

    /// Deserialize a listener from an argument passed on the command-line.
    /// This produces a dummy listener and is only kept to provide shared logic
    /// with Windows.
    pub fn deserialize(_string: &CStr, _pid: Pid) -> Result<IPCListener, IPCError> {
        Ok(IPCListener {})
    }
}
