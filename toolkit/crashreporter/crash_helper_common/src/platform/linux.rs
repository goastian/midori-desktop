/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use nix::{
    fcntl::{
        fcntl,
        FcntlArg::{F_GETFL, F_SETFD, F_SETFL},
        FdFlag, OFlag,
    },
    sys::socket::{socketpair, AddressFamily, SockFlag, SockType},
    Result,
};
use std::{
    os::fd::{BorrowedFd, OwnedFd},
};

pub type ProcessHandle = ();

pub(crate) fn unix_socketpair() -> Result<(OwnedFd, OwnedFd)> {
    socketpair(
        AddressFamily::Unix,
        SockType::SeqPacket,
        None,
        SockFlag::empty(),
    )
}

pub(crate) fn set_socket_default_flags(socket: BorrowedFd) -> Result<()> {
    // All our sockets are in non-blocking mode.
    let flags = OFlag::from_bits_retain(fcntl(socket, F_GETFL)?);
    fcntl(socket, F_SETFL(flags.union(OFlag::O_NONBLOCK))).map(|_res| ())
}

pub(crate) fn set_socket_cloexec(socket: BorrowedFd) -> Result<()> {
    fcntl(socket, F_SETFD(FdFlag::FD_CLOEXEC)).map(|_res| ())
}
