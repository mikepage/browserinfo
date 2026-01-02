import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import BrowserInfo from "../islands/BrowserInfo.tsx";

export default define.page(function Home() {
  return (
    <div class="min-h-screen bg-[#fafafa]">
      <Head>
        <title>Browser Info</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
        <style>{`
          * { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        `}</style>
      </Head>
      <div class="px-6 md:px-12 py-8">
        <div class="max-w-4xl mx-auto">
          <h1 class="text-2xl font-normal text-[#111] tracking-tight mb-2">
            Browser Info
          </h1>
          <p class="text-[#666] text-sm mb-8">
            Discover your IP addresses and view browser information.
          </p>
          <BrowserInfo />
        </div>
      </div>
    </div>
  );
});
