import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface DetectedApi {
  name: string;
  category: string;
  pattern: string;
}

interface ServiceWorkerDetails {
  scriptURL: string;
  state: string;
  scope: string;
  source: string | null;
  sourceError: string | null;
  apis: DetectedApi[];
}

const API_PATTERNS: { name: string; category: string; patterns: RegExp[] }[] = [
  { name: "Scroll Events", category: "DOM", patterns: [/\bscroll\b/i, /scrollTo\b/i, /scrollBy\b/i, /scrollIntoView\b/i] },
  { name: "Fetch API", category: "Network", patterns: [/\bfetch\s*\(/] },
  { name: "Cache API", category: "Storage", patterns: [/caches\.\w+/, /CacheStorage\b/, /cache\.put\b/, /cache\.match\b/, /cache\.addAll\b/] },
  { name: "Push API", category: "Messaging", patterns: [/push\s*\.subscribe/, /PushManager\b/, /pushManager\b/, /onpush\b/] },
  { name: "Background Sync", category: "Sync", patterns: [/SyncManager\b/, /sync\.register\b/, /onsync\b/] },
  { name: "Periodic Sync", category: "Sync", patterns: [/periodicSync\b/, /onperiodicsync\b/] },
  { name: "Notifications", category: "Messaging", patterns: [/showNotification\b/, /Notification\b/, /onnotificationclick\b/, /onnotificationclose\b/] },
  { name: "IndexedDB", category: "Storage", patterns: [/indexedDB\b/, /IDBDatabase\b/, /objectStore\b/] },
  { name: "Clients API", category: "Navigation", patterns: [/clients\.matchAll\b/, /clients\.openWindow\b/, /clients\.claim\b/, /client\.postMessage\b/] },
  { name: "postMessage", category: "Messaging", patterns: [/postMessage\s*\(/, /onmessage\b/] },
  { name: "Navigation Preload", category: "Network", patterns: [/navigationPreload\b/, /preloadResponse\b/] },
  { name: "Background Fetch", category: "Network", patterns: [/backgroundFetch\b/, /onbackgroundfetch\w+/] },
  { name: "Web Sockets", category: "Network", patterns: [/WebSocket\b/, /\bnew\s+WebSocket\b/] },
  { name: "Streams API", category: "Network", patterns: [/ReadableStream\b/, /WritableStream\b/, /TransformStream\b/] },
  { name: "importScripts", category: "Loading", patterns: [/importScripts\s*\(/] },
  { name: "Lifecycle Events", category: "Lifecycle", patterns: [/oninstall\b/, /onactivate\b/, /addEventListener\s*\(\s*['"]install['"]/, /addEventListener\s*\(\s*['"]activate['"]/] },
  { name: "Fetch Event", category: "Lifecycle", patterns: [/addEventListener\s*\(\s*['"]fetch['"]/, /onfetch\b/, /FetchEvent\b/] },
  { name: "Skip Waiting", category: "Lifecycle", patterns: [/skipWaiting\s*\(/] },
];

function detectApis(source: string): DetectedApi[] {
  const detected: DetectedApi[] = [];
  for (const apiDef of API_PATTERNS) {
    for (const pattern of apiDef.patterns) {
      const match = source.match(pattern);
      if (match) {
        detected.push({
          name: apiDef.name,
          category: apiDef.category,
          pattern: match[0],
        });
        break;
      }
    }
  }
  return detected;
}

export default function ServiceWorkerInfo() {
  const workers = useSignal<ServiceWorkerDetails[]>([]);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);
  const supported = useSignal(true);
  const expandedSource = useSignal<string | null>(null);

  useEffect(() => {
    detectServiceWorkers();
  }, []);

  const detectServiceWorkers = async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      supported.value = false;
      loading.value = false;
      return;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();

      const details: ServiceWorkerDetails[] = await Promise.all(
        registrations.map(async (reg) => {
          const sw = reg.active || reg.waiting || reg.installing;
          const scriptURL = sw?.scriptURL || reg.scope;
          const state = sw?.state || "unknown";

          let source: string | null = null;
          let sourceError: string | null = null;
          let apis: DetectedApi[] = [];

          try {
            const res = await fetch(scriptURL);
            if (res.ok) {
              source = await res.text();
              apis = detectApis(source);
            } else {
              sourceError = `HTTP ${res.status}`;
            }
          } catch {
            sourceError = "Could not fetch source";
          }

          return {
            scriptURL,
            state,
            scope: reg.scope,
            source,
            sourceError,
            apis,
          };
        }),
      );

      workers.value = details;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Detection failed";
    }

    loading.value = false;
  };

  if (!supported.value) {
    return (
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Service Workers</h3>
        <p class="text-gray-500 text-sm">Service Workers are not supported in this browser.</p>
      </div>
    );
  }

  const categoryColors: Record<string, string> = {
    DOM: "bg-purple-100 text-purple-800",
    Network: "bg-blue-100 text-blue-800",
    Storage: "bg-green-100 text-green-800",
    Messaging: "bg-yellow-100 text-yellow-800",
    Sync: "bg-orange-100 text-orange-800",
    Navigation: "bg-teal-100 text-teal-800",
    Loading: "bg-gray-100 text-gray-800",
    Lifecycle: "bg-indigo-100 text-indigo-800",
  };

  const stateColors: Record<string, string> = {
    activated: "bg-green-100 text-green-800",
    installed: "bg-blue-100 text-blue-800",
    installing: "bg-yellow-100 text-yellow-800",
    waiting: "bg-orange-100 text-orange-800",
    redundant: "bg-red-100 text-red-800",
    unknown: "bg-gray-100 text-gray-800",
  };

  return (
    <div class="bg-white rounded-lg shadow">
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">Service Workers</h3>
          {!loading.value && (
            <span class="text-xs text-gray-500">
              {workers.value.length} registered
            </span>
          )}
        </div>

        {loading.value ? (
          <div class="animate-pulse space-y-3">
            <div class="h-5 bg-gray-200 rounded w-64"></div>
            <div class="h-4 bg-gray-200 rounded w-48"></div>
          </div>
        ) : error.value ? (
          <p class="text-gray-500 text-sm">{error.value}</p>
        ) : workers.value.length === 0 ? (
          <p class="text-gray-500 text-sm">
            No service workers registered for this origin.
          </p>
        ) : (
          <div class="space-y-4">
            {workers.value.map((sw, i) => {
              const isExpanded = expandedSource.value === sw.scriptURL;
              return (
                <div key={i} class="border border-gray-200 rounded-lg overflow-hidden">
                  <div class="p-4 space-y-3">
                    {/* Script URL */}
                    <div>
                      <span class="text-sm text-gray-500">Script</span>
                      <p class="font-mono text-xs bg-gray-50 p-2 rounded mt-1 break-all">
                        {sw.scriptURL}
                      </p>
                    </div>

                    {/* Scope and State row */}
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <span class="text-sm text-gray-500">Scope</span>
                        <p class="font-mono text-xs bg-gray-50 p-2 rounded mt-1 break-all">
                          {sw.scope}
                        </p>
                      </div>
                      <div>
                        <span class="text-sm text-gray-500">State</span>
                        <p class="mt-1">
                          <span class={`inline-block text-xs font-medium px-2 py-1 rounded ${stateColors[sw.state] || stateColors.unknown}`}>
                            {sw.state}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Detected APIs */}
                    {sw.apis.length > 0 && (
                      <div>
                        <span class="text-sm text-gray-500">Detected APIs</span>
                        <div class="flex flex-wrap gap-1.5 mt-2">
                          {sw.apis.map((api, j) => (
                            <span
                              key={j}
                              class={`inline-block text-xs px-2 py-1 rounded font-medium ${categoryColors[api.category] || "bg-gray-100 text-gray-800"}`}
                              title={`Matched: ${api.pattern}`}
                            >
                              {api.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* View Source button */}
                    {sw.source ? (
                      <button
                        onClick={() => {
                          expandedSource.value = isExpanded ? null : sw.scriptURL;
                        }}
                        class="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                      >
                        {isExpanded ? "Hide Source" : "View Source"}
                      </button>
                    ) : sw.sourceError ? (
                      <p class="text-xs text-gray-400">
                        Source unavailable: {sw.sourceError}
                      </p>
                    ) : null}
                  </div>

                  {/* Expanded source code */}
                  {isExpanded && sw.source && (
                    <div class="border-t border-gray-200 bg-gray-900 p-4 overflow-x-auto">
                      <pre class="text-xs text-gray-200 whitespace-pre font-mono leading-relaxed">
                        {sw.source}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
