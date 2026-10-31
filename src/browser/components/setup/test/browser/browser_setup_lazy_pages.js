/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function test_setup_loads_themes_when_the_picker_is_shown() {
  await BrowserTestUtils.withNewTab({ gBrowser, url: "about:setup" }, async browser => {
    const doc = browser.contentDocument;
    Assert.equal(doc.querySelector(".page.visible").id, "welcome");
    Assert.equal(doc.querySelectorAll(".theme-card").length, 0);
    Assert.equal(
      doc.defaultView.getComputedStyle(doc.getElementById("welcomeNext")).animationName,
      "none",
      "The primary action has no delayed entrance animation"
    );

    for (const id of ["welcomeNext", "accountNext", "importNext"]) {
      doc.getElementById(id).click();
    }
    Assert.equal(doc.querySelector(".page.visible").id, "color");
    await TestUtils.waitForCondition(
      () => doc.querySelectorAll(".theme-card").length > 0,
      "The theme catalog loads after entering the color step"
    );
    const count = doc.querySelectorAll(".theme-card").length;
    doc.getElementById("colorBack").click();
    Assert.equal(doc.querySelector(".page.visible").id, "import");
    doc.getElementById("importNext").click();
    Assert.equal(doc.querySelector(".page.visible").id, "color");
    Assert.equal(doc.querySelectorAll(".theme-card").length, count);

    doc.getElementById("colorNext").click();
    Assert.equal(doc.querySelector(".page.visible").id, "tablayout");
    doc.getElementById("tablayoutNext").click();
    Assert.equal(doc.querySelector(".page.visible").id, "msidebar");
    doc.getElementById("msidebarNext").click();
    Assert.equal(doc.querySelector(".page.visible").id, "warmwelcome");
  });
});
