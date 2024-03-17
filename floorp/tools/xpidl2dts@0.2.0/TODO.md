# TODOs

```ts
export interface nsIXPCTestCEnums extends nsISupports {
  ///CONST 1
  readonly testConst: number;
  ///CENUM {
  testFlagsExplicit: {
    shouldBe1Explicit: 1;
    shouldBe2Explicit: 2;
    shouldBe4Explicit: 4;
    shouldBe8Explicit: 8;
    shouldBe12Explicit: NaN;
  };
  ///CENUM {
  testFlagsImplicit: {
    shouldBe0Implicit: 0;
    shouldBe1Implicit: 1;
    shouldBe2Implicit: 2;
    shouldBe3Implicit: 3;
    shouldBe5Implicit: 5;
    shouldBe6Implicit: 6;
    shouldBe2AgainImplicit: 2;
    shouldBe3AgainImplicit: 3;
  };
  testCEnumInput: (
    abc: nsIXPCTestCEnums_testFlagsExplicit, ///in
  ) => void;
  testCEnumOutput: () => nsIXPCTestCEnums_testFlagsExplicit;
}
```

it is not critical for using
