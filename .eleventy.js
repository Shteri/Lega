const fs = require("fs");
const path = require("path");

module.exports = function (eleventyConfig) {

  // --- Static pass-through ---
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/assets");

  // --- Global data from /data/ JSON files ---
  // These files are written by agents and committed to git.
  // 11ty reads them at build time.

  function safeRead(filePath) {
    try {
      return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
    } catch {
      return [];
    }
  }

  eleventyConfig.addGlobalData("wire",      () => safeRead("data/wire/items.json"));
  eleventyConfig.addGlobalData("deadlines", () => safeRead("data/deadlines.json"));

  // Pillar pages: read all JSON files from data/pillars/
  eleventyConfig.addGlobalData("pillars", () => {
    const dir = path.resolve("data/pillars");
    try {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    } catch {
      return [];
    }
  });

  // Regulator hub: read all JSON files from data/regulators/
  eleventyConfig.addGlobalData("regulators", () => {
    const dir = path.resolve("data/regulators");
    try {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    } catch {
      return [];
    }
  });

  // --- Collections ---
  // All published articles, newest first
  eleventyConfig.addCollection("articles", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/articles/**/*.md")
      .sort((a, b) => b.date - a.date);
  });

  // Articles grouped by sector
  const SECTORS = ["AI", "FT", "CR", "PL", "PV", "GG", "CY"];
  for (const sector of SECTORS) {
    eleventyConfig.addCollection(`articles_${sector}`, (collectionApi) => {
      return collectionApi
        .getFilteredByGlob("src/articles/**/*.md")
        .filter(a => a.data.sector === sector)
        .sort((a, b) => b.date - a.date);
    });
  }

  // --- Filters ---
  eleventyConfig.addFilter("dateformat", (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric"
    });
  });

  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));

  eleventyConfig.addFilter("bySector", (arr, sector) =>
    (arr || []).filter(item => item.data?.sector === sector || item.sector === sector)
  );

  eleventyConfig.addFilter("json", (val) => JSON.stringify(val, null, 2));

  // --- Config ---
  return {
    templateFormats:       ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine:    "njk",
    dir: {
      input:    "src",
      output:   "_site",
      includes: "_includes",
      data:     "_data"
    }
  };
};
