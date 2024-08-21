

var FloorpBrowserSearchResult = {
    _initialized: false,
    currentSearchWord: null,
    
    init() {
        if (this._initialized) {
            return;
        }
        this._initialized = true;

        // NOTE: We will use Workspacs for linking to the search result.
        // How To Use Workspaces From Here: "window.windowRoot.ownerGlobal.gWorkspaces"

        const gotSearchWordFromUrl = this.getSearchWordFromUrl();
        if (gotSearchWordFromUrl) {
            this.currentSearchWord = gotSearchWordFromUrl;
            this.search(gotSearchWordFromUrl);
        }
    },

    getSearchWordFromUrl() {
        const currentURL = new URL(window.location.href);
        const searchParams  = currentURL.searchParams;
        
        return searchParams.get("sw");
    },

    // NOTE: This is working.
    search(searchWord) {
        if (!searchWord) {
            return;
        }

        document.getElementById("search-input").value = searchWord;
    }
};

document.addEventListener("DOMContentLoaded", () => {
    FloorpBrowserSearchResult.init();
});
