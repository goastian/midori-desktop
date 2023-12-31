def WebIDLTest(parser, harness):
    parser.parse(
        """
        interface TestIncompleteParent : NotYetDefined {
          undefined foo();
        };

        interface NotYetDefined : EvenHigherOnTheChain {
        };

        interface EvenHigherOnTheChain {
        };
    """
    )

    parser.finish()

    harness.ok(True, "TestIncompleteParent interface parsed without error.")
