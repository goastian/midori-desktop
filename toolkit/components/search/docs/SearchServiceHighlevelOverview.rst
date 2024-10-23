=================================
SearchService High-level Overview
=================================
``SearchService`` is the core component that manages Search Engines on the
Firefox browser.

The following diagram is a high level systems context diagram of the
``SearchService``. The diagram illustrates which systems interface with the
``SearchService`` so that it can do its job of managing the Search Engines.

The diagram and description is an over-simplification of the ``SearchService's``
responsibilities. It specifically highlights how the ``SearchService`` serves
search engines to the browser on startup. However, the ``SearchService`` has
many other responsibilities that are not outlined in the diagram such as
maintaining and managing the Search Engines when various items change, e.g. the
user's region or locale, configuration changes received from remote settings,
updates received to search engine data. Nonetheless, the diagram gives a broad
overview of the main components the ``SearchService`` interacts with most often.

Diagram
=======
.. figure:: assets/search-service-diagram-2.png
   :scale: 30%
   :align: center

Description of the Diagram
==========================
These steps follow the same number on the diagram. Number 1 on the diagram is
described by number 1 below.

1. When the user opens the Firefox Browser, the code starts to build the browser
   UI components. During this startup phase, we have various systems making
   calls to the ``SearchService``. E.g. `browser.js <https://searchfox.org/mozilla-central/rev/47db1be98f8069b387ce07dcbea22d09f1854515/browser/base/content/browser.js#3325>`_
   calls ``Services.search.getDefault`` to fetch the default Search Engine.

2. The ``SearchService`` needs information from ``Extension System``,
   ``SearchSettings``, and ``Remote Settings`` to build the correct engines in
   the right order and to return the list of engines to its callers.

   a) First, the ``SearchService`` makes a request for the search configuration.
   ``SearchService`` calls `SearchEngineSelector.fetchEngineConfiguration <https://searchfox.org/mozilla-central/rev/47db1be98f8069b387ce07dcbea22d09f1854515/toolkit/components/search/SearchService.sys.mjs#2602>`_
   which makes a call to `Remote Settings <https://searchfox.org/mozilla-central/rev/47db1be98f8069b387ce07dcbea22d09f1854515/toolkit/components/search/SearchEngineSelector.sys.mjs#119>`_
   for the search configuration. Remote Settings does not fetch the search
   configuration from the remote database on startup. Instead Remote Settings
   tries to load the :searchfox:`search configuration dump file <services/settings/dumps/main/search-config-v2.json>`
   from its local database and if that is empty, it will load the dump file into
   its local database. Only after startup will Remote Settings connect to the
   remote database when necessary. By connecting after startup, it avoids
   a potential network request that could delay startup.

   b) Second, the ``SearchService`` `fetches a JSON file <https://searchfox.org/mozilla-central/rev/47db1be98f8069b387ce07dcbea22d09f1854515/toolkit/components/search/SearchService.sys.mjs#1368>`_
   from the `SearchSettings <https://searchfox.org/mozilla-central/source/toolkit/components/search/SearchSettings.sys.mjs>`_.
   This JSON file contains Search Engine metadata that is saved on the user's
   computer. It's information that helps the ``SearchService`` remember the
   user's custom settings for the Search Engines.

   c) Third, the `Extension System <https://searchfox.org/mozilla-central/rev/cb6f8d7b1f1782b9d4b2ee7312de1dcc284aaf06/browser/components/extensions/parent/ext-chrome-settings-overrides.js#536>`_
   passes the extension data to the ``SearchService``. At this point, the
   ``SearchService`` only installs user installed search extensions.

   After steps 2a, 2b, and 2c the ``SearchService`` has finished gathering
   search engine data from ``System Add-ons``, ``SearchSettings``, and
   ``Remote Settings``. Now the ``SearchService`` can build the different
   types of Search Engines.

3. The ``SearchService`` creates new instances of :searchfox:`SearchEngines <toolkit/components/search/SearchEngine.sys.mjs>`
   by making an `App-Provided, Add-on, Open Search, or Enterprise Policy Search Engine <https://firefox-source-docs.mozilla.org/toolkit/search/SearchEngines.html>`_.

4. The ``SearchService`` returns the engines to the caller that requested it.
   E.g. the ``SearchService`` passes the default Search Engine back to
   ``browser.js``, the system that initially requested it.

Updates
=======
This page is up to date as of April 18, 2024. If the diagram or description
becomes out of date, please find access to the ``Search Service Diagram`` in
``Firefox Search > Search Service Documentation`` folder in the Firefox Search
shared drive. Contributions are welcomed to keep this page up to date.
