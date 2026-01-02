import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import BrowserInfo from "../islands/BrowserInfo.tsx";

export default define.page(function Home() {
  return (
    <div class="min-h-screen bg-[#fafafa]">
      <Head>
        <title>Browser Info</title>
      </Head>
      <div class="px-6 md:px-12 py-8">
        <div class="max-w-4xl mx-auto">
          <h1 class="text-2xl font-normal text-[#111] tracking-tight mb-2">
            Browser Info
          </h1>
          <p class="text-[#666] text-sm mb-8">
            Discover your IP addresses, check DNSSEC validation, and view
            browser information. A simplified alternative to dnscheck.tools.
          </p>
          <BrowserInfo />
        </div>
      </div>
    </div>
  );
});
