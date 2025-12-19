type HolidayMap = Record<string, string>;

async function main() {
  const year = 2025;
  const res = await fetch("https://holidays-jp.github.io/api/v1/date.json");
  if (!res.ok) {
    throw new Error(`holiday api failed: ${res.status} ${res.statusText}`);
  }

  const all = (await res.json()) as HolidayMap;
  const july = Object.entries(all)
    .filter(([date]) => date.startsWith(`${year}-07-`))
    .sort(([a], [b]) => a.localeCompare(b));

  console.log(`${year}年7月の祝日 (${july.length}件)`);
  for (const [date, name] of july) {
    console.log(`- ${date}: ${name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
