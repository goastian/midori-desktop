/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jit/Disassemble.h"
#include "jit/Linker.h"
#include "jit/MacroAssembler.h"
#include "js/GCAPI.h"

#include "jsapi-tests/tests.h"
#include "jsapi-tests/testsJit.h"

#include "jit/MacroAssembler-inl.h"

using namespace js;
using namespace js::jit;

#if defined(JS_JITSPEW) && defined(JS_CODEGEN_X64)
using DisasmCharVector = js::Vector<char, 64, SystemAllocPolicy>;
static MOZ_THREAD_LOCAL(DisasmCharVector*) disasmResult;

static void CaptureDisasmText(const char* text) {
  // Skip the instruction offset (8 bytes) and two space characters, because the
  // offsets make it harder to modify the test.
  MOZ_RELEASE_ASSERT(strlen(text) > 10);
  text = text + 10;
  MOZ_RELEASE_ASSERT(disasmResult.get()->append(text, text + strlen(text)));
  MOZ_RELEASE_ASSERT(disasmResult.get()->append('\n'));
}

BEGIN_TEST(testAssemblerCodeGen_x64_cmp8) {
  TempAllocator tempAlloc(&cx->tempLifoAlloc());
  JitContext jcx(cx);
  StackMacroAssembler masm(cx, tempAlloc);
  AutoCreatedBy acb(masm, __func__);

  masm.cmp8(Operand(rax), rbx);
  masm.cmp8(Operand(rax), rdi);
  masm.cmp8(Operand(rdi), rax);
  masm.cmp8(Operand(rdi), rdi);
  masm.cmp8(Operand(r10), r13);

  masm.cmp8(Operand(Address(rax, 0)), rbx);
  masm.cmp8(Operand(Address(rax, 1)), rdi);
  masm.cmp8(Operand(Address(rdi, 0x10)), rax);
  masm.cmp8(Operand(Address(rdi, 0x20)), rdi);
  masm.cmp8(Operand(Address(r10, 0x30)), r11);
  masm.cmp8(Operand(Address(rsp, 0x40)), rdi);

  masm.cmp8(Operand(BaseIndex(rax, rbx, TimesFour, 0)), rcx);
  masm.cmp8(Operand(BaseIndex(rax, rbx, TimesEight, 1)), rdi);
  masm.cmp8(Operand(BaseIndex(rdi, rax, TimesOne, 2)), rdi);
  masm.cmp8(Operand(BaseIndex(rax, rdi, TimesTwo, 3)), rdi);
  masm.cmp8(Operand(BaseIndex(r10, r11, TimesFour, 4)), r12);
  masm.cmp8(Operand(BaseIndex(rsp, rax, TimesEight, 5)), rdi);

  void* ptr = (void*)0x1234;
  masm.cmp8(Operand(AbsoluteAddress(ptr)), rax);
  masm.cmp8(Operand(AbsoluteAddress(ptr)), rsi);
  masm.cmp8(Operand(AbsoluteAddress(ptr)), r15);

  // For Imm32(0) we emit a |test| instruction.
  masm.cmp8(Operand(rax), Imm32(0));
  masm.cmp8(Operand(rbx), Imm32(0));
  masm.cmp8(Operand(rdi), Imm32(0));
  masm.cmp8(Operand(r8), Imm32(0));
  masm.cmp8(Operand(rax), Imm32(1));
  masm.cmp8(Operand(rbx), Imm32(-1));
  masm.cmp8(Operand(rdi), Imm32(2));
  masm.cmp8(Operand(r8), Imm32(-2));

  CHECK(!masm.oom());

  Linker linker(masm);
  JitCode* code = linker.newCode(cx, CodeKind::Other);
  CHECK(code);

  DisasmCharVector disassembled;
  disasmResult.set(&disassembled);
  auto onFinish = mozilla::MakeScopeExit([&] { disasmResult.set(nullptr); });

  {
    // jit::Disassemble can't GC.
    JS::AutoSuppressGCAnalysis nogc;
    jit::Disassemble(code->raw(), code->instructionsSize(), &CaptureDisasmText);
  }

  static const char* expected =
      "3a c3                                 cmp %bl, %al\n"
      "40 3a c7                              cmp %dil, %al\n"
      "40 3a f8                              cmp %al, %dil\n"
      "40 3a ff                              cmp %dil, %dil\n"
      "45 3a d5                              cmp %r13b, %r10b\n"

      "38 18                                 cmpb %bl, (%rax)\n"
      "40 38 78 01                           cmpb %dil, 0x01(%rax)\n"
      "38 47 10                              cmpb %al, 0x10(%rdi)\n"
      "40 38 7f 20                           cmpb %dil, 0x20(%rdi)\n"
      "45 38 5a 30                           cmpb %r11b, 0x30(%r10)\n"
      "40 38 7c 24 40                        cmpb %dil, 0x40(%rsp)\n"

      "38 0c 98                              cmpb %cl, (%rax,%rbx,4)\n"
      "40 38 7c d8 01                        cmpb %dil, 0x01(%rax,%rbx,8)\n"
      "40 38 7c 07 02                        cmpb %dil, 0x02(%rdi,%rax,1)\n"
      "40 38 7c 78 03                        cmpb %dil, 0x03(%rax,%rdi,2)\n"
      "47 38 64 9a 04                        cmpb %r12b, 0x04(%r10,%r11,4)\n"
      "40 38 7c c4 05                        cmpb %dil, 0x05(%rsp,%rax,8)\n"

      "38 04 25 34 12 00 00                  cmpb %al, 0x0000000000001234\n"
      "40 38 34 25 34 12 00 00               cmpb %sil, 0x0000000000001234\n"
      "44 38 3c 25 34 12 00 00               cmpb %r15b, 0x0000000000001234\n"

      "84 c0                                 test %al, %al\n"
      "84 db                                 test %bl, %bl\n"
      "40 84 ff                              test %dil, %dil\n"
      "45 84 c0                              test %r8b, %r8b\n"
      "3c 01                                 cmp $0x01, %al\n"
      "80 fb ff                              cmp $-0x01, %bl\n"
      "40 80 ff 02                           cmp $0x02, %dil\n"
      "41 80 f8 fe                           cmp $-0x02, %r8b\n"

      "0f 0b                                 ud2\n";

  bool matched = disassembled.length() == strlen(expected) &&
                 memcmp(expected, disassembled.begin(), strlen(expected)) == 0;
  if (!matched) {
    CHECK(disassembled.append('\0'));
    fprintf(stderr, "Generated:\n%s\n", disassembled.begin());
    fprintf(stderr, "Expected:\n%s\n", expected);
  }
  CHECK(matched);

  return true;
}
END_TEST(testAssemblerCodeGen_x64_cmp8)

#endif  // defined(JS_JITSPEW) && defined(JS_CODEGEN_X64)
