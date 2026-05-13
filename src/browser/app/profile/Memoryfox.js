
/****************************************************************************
 * Memoryfox                                                                 *
 * "Memoria est thesaurus omnium rerum"                                      *
 * priority: reduce RAM consumption while maintaining usability              *
 * version: 1.0                                                              *
 * url: https://github.com/goastian/midori-desktop                           *
 * Based on Firefox memory optimization best practices                       *
 ***************************************************************************/

/****************************************************************************
 * SECTION: PROCESS MANAGEMENT                                               *
 * These settings have the LARGEST impact on RAM usage                       *
 ***************************************************************************/

// PREF: control the number of content processes
// Firefox uses multi-process architecture (Electrolysis/e10s)
// Each content process uses ~150-300MB of RAM
// Default is 8 processes which can use 1-2GB+ RAM
// Reducing this significantly lowers memory usage
// [WARNING] Lower values may reduce stability and security isolation
// [NOTE] Fission (site isolation) creates additional processes per-site
// Recommended: 4 for balanced, 2 for low-RAM systems, 1 for minimal RAM
// [1] https://wiki.mozilla.org/Electrolysis
// [2] https://support.mozilla.org/kb/performance-settings
pref("dom.ipc.processCount", 1); // default=8; balanced (4 saves ~400MB RAM)
//pref("dom.ipc.processCount", 2); // low RAM systems (<8GB)
//pref("dom.ipc.processCount", 1); // minimal RAM (not recommended)

// PREF: limit web-isolated processes (Fission)
// Controls processes per eTLD+1 domain when Fission is enabled
// Lower values = less RAM but reduced security isolation
pref("dom.ipc.processCount.webIsolated", 2); // default=4

// PREF: Fork Server [LINUX] [FF135+]
// Enables copy-on-write memory sharing between processes
// Can significantly reduce memory when many tabs are open
// [NOTE] Only works on Linux - harmless on other platforms
// [1] https://bugzilla.mozilla.org/show_bug.cgi?id=1495003
pref("dom.ipc.forkserver.enable", true); // [FF135+] [LINUX]

// PREF: limit privileged processes
pref("dom.ipc.processCount.privilegedabout", 1); // default=1
pref("dom.ipc.processCount.privilegedmozilla", 1); // default=1

// PREF: disable preallocation of content processes
// Firefox pre-launches processes to speed up new tabs
// Disabling saves RAM but new tabs open slightly slower
pref("dom.ipc.processPrelaunch.enabled", false);
pref("dom.ipc.processPrelaunch.fission.number", 0); // default=3

/****************************************************************************
 * SECTION: MEMORY CACHE                                                     *
 * Controls how much RAM Firefox uses for caching                            *
 ***************************************************************************/

// PREF: memory cache capacity
// Controls how much RAM is used for caching decoded content
// -1 = automatic (based on system RAM, can be high)
// Lower values reduce RAM but may increase disk reads
// [1] https://kb.mozillazine.org/Browser.cache.memory.capacity
pref("browser.cache.memory.capacity", 32768); // 32 MB (default automatic ~256MB)
//pref("browser.cache.memory.capacity", 32768); // 32 MB for low-RAM
//pref("browser.cache.memory.capacity", 16384); // 16 MB minimal

// PREF: maximum size of a single cached entry
pref("browser.cache.memory.max_entry_size", 10240); // 10 MB (default=5120)

// PREF: enable disk cache to reduce RAM usage
// When enabled, less needs to be stored in RAM
pref("browser.cache.disk.enable", true);
pref("browser.cache.disk.capacity", 512000); // 500 MB disk cache
pref("browser.cache.disk.smart_size.enabled", true);

// PREF: optimize cache frecency to free memory faster
pref("browser.cache.frecency_half_life_hours", 3); // default=6

/****************************************************************************
 * SECTION: SESSION HISTORY                                                  *
 * Controls Back/Forward cache which stores pages in RAM                     *
 ***************************************************************************/

// PREF: Back/Forward cache (bfcache) page limit
// Each cached page can use 10-50MB+ RAM
// -1 = automatic (8 pages), 0 = disable
// [1] https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/1.5/Using_Firefox_1.5_caching
pref("browser.sessionhistory.max_total_viewers", 1); // default=8

// PREF: limit stored closed tabs
pref("browser.sessionstore.max_tabs_undo", 3); // default=25

// PREF: limit stored closed windows
pref("browser.sessionstore.max_windows_undo", 1); // default=3

// PREF: increase session save interval
// Less frequent saves = less memory pressure from serialization
pref("browser.sessionstore.interval", 120000); // 2 minutes (default=15000)

/****************************************************************************
 * SECTION: MEDIA MEMORY                                                     *
 * Video and audio caching uses significant RAM                              *
 ***************************************************************************/

// PREF: media memory cache
// Large media files are cached in RAM for smooth playback
pref("media.memory_cache_max_size", 32768); // 32 MB (default=8192)
//pref("media.memory_cache_max_size", 32768); // 32 MB for low-RAM

// PREF: combined media caches limit
pref("media.memory_caches_combined_limit_kb", 131072); // 128 MB (default=524288)
//pref("media.memory_caches_combined_limit_kb", 65536); // 64 MB for low-RAM

// PREF: percentage of system memory for media caches
pref("media.memory_caches_combined_limit_pc_sysmem", 3); // default=5

// PREF: media cache read-ahead
// Reduces pre-buffering to save RAM
pref("media.cache_readahead_limit", 60); // default=60; seconds ahead
pref("media.cache_resume_threshold", 30); // default=30

/****************************************************************************
 * SECTION: IMAGE CACHE                                                      *
 * Image decoding and caching memory                                         *
 ***************************************************************************/

// PREF: image cache size
pref("image.cache.size", 5242880); // 5 MB (default=5242880)

// PREF: decoded image memory limit
// Controls how much RAM decoded images can use
// [HIDDEN PREF] May not exist in all versions
//pref("image.mem.max_decoded_image_kb", 256000); // 250 MB

// PREF: image decode chunk size
// Smaller chunks = less peak RAM during decoding
pref("image.mem.decode_bytes_at_a_time", 16384); // default=16384

// PREF: discard decoded images after timeout
// Images are re-decoded when needed, saving RAM
pref("image.mem.discardable", true); // DEFAULT
pref("image.mem.animated.discardable", true);

// PREF: shared surface unmap timeout
pref("image.mem.shared.unmap.min_expiration_ms", 120000); // default=120000

/****************************************************************************
 * SECTION: JAVASCRIPT MEMORY / GARBAGE COLLECTION                           *
 * SpiderMonkey (JS engine) memory management                                *
 ***************************************************************************/

// PREF: incremental GC slice duration
// Smaller slices = more frequent but shorter GC pauses
// Keeps memory cleaner but may impact smoothness
pref("javascript.options.mem.gc_incremental_slice_ms", 5); // default=5

// PREF: GC high frequency mode
// More aggressive GC when memory pressure is detected
pref("javascript.options.mem.gc_high_frequency_heap_growth_max", 200); // default=300
pref("javascript.options.mem.gc_high_frequency_heap_growth_min", 120); // default=150

// PREF: GC heap growth factor
// Lower = GC runs more frequently, using less peak RAM
pref("javascript.options.mem.gc_heap_growth_factor", 100); // default=150 (%)

// PREF: compact on user inactive
// Run memory compaction when user is idle
pref("javascript.options.compact_on_user_inactive", true); // DEFAULT
pref("javascript.options.compact_on_user_inactive_delay", 15000); // default=15000

// PREF: GC on memory pressure
pref("javascript.options.mem.gc_on_memory_pressure", true);

// PREF: enable memory pressure handling
// Allows Firefox to respond to OS low-memory signals
pref("memory.free_dirty_pages", true);

/****************************************************************************
 * SECTION: DOM AND CONTENT                                                  *
 * DOM node and content memory optimizations                                 *
 ***************************************************************************/

// PREF: limit stored consoleMessages
pref("devtools.hud.loglimit", 100); // default=10000

// PREF: WebGL memory
pref("webgl.max-size", 8192); // default=1024 (can be high)

// PREF: disable speculative parsing
// Saves memory but may slow page loading
//pref("dom.document_preloading.enabled", false);

/****************************************************************************
 * SECTION: NETWORK MEMORY                                                   *
 * Network buffers and connection memory                                     *
 ***************************************************************************/

// PREF: reduce connection pool size
pref("network.http.max-connections", 600); // default=900
pref("network.http.max-persistent-connections-per-server", 6); // default=6

// PREF: DNS cache entries
pref("network.dnsCacheEntries", 400); // default=400

// PREF: SSL token cache
pref("network.ssl_tokens_cache_capacity", 4096); // default=2048

/****************************************************************************
 * SECTION: GRAPHICS MEMORY                                                  *
 * GPU and rendering memory                                                  *
 ***************************************************************************/

// PREF: canvas accelerated cache
pref("gfx.canvas.accelerated.cache-items", 8192); // default=8192
pref("gfx.canvas.accelerated.cache-size", 512); // default=256

// PREF: Skia font cache
pref("gfx.content.skia-font-cache-size", 16); // default=5

// PREF: WebRender texture cache
// Lower = less VRAM usage but more re-rendering
//pref("gfx.webrender.max-shared-surface-size", 1024); // default=1024

/****************************************************************************
 * SECTION: TAB MANAGEMENT                                                   *
 * Tab memory optimizations                                                  *
 ***************************************************************************/

// PREF: tab unloading on memory pressure
// Automatically unloads tabs when RAM is low
pref("browser.tabs.unloadOnLowMemory", true);

// PREF: lazy tab loading on session restore
// Only loads active tab, others load on demand
pref("browser.sessionstore.restore_on_demand", true); // DEFAULT
pref("browser.sessionstore.restore_tabs_lazily", true); // DEFAULT
pref("browser.sessionstore.restore_pinned_tabs_on_demand", true);

// PREF: new tab preloading
// Disabling saves RAM but new tabs open slightly slower
//pref("browser.newtab.preload", false);

/****************************************************************************
 * SECTION: EXPERIMENTAL / AGGRESSIVE                                        *
 * Use with caution - may affect stability or privacy                        *
 ***************************************************************************/

// PREF: disable Fission (site isolation)
// [WARNING] Reduces security! Only for very low-RAM systems
// Fission creates separate processes per-site for security
// Disabling can save hundreds of MB but reduces protection
//pref("fission.autostart", false);

// PREF: disable network partitioning
// [WARNING] Reduces privacy! Allows cross-site cache sharing
// Can reduce memory by sharing cached resources across sites
//pref("privacy.partition.network_state", false);

// PREF: disable ServiceWorkers 
// [WARNING] May break PWAs and some sites
// ServiceWorkers can consume significant memory
//pref("dom.serviceWorkers.enabled", false);
