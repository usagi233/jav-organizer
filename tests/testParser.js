import simpleScraper from "../simpleScraper.js";
import browserScraper from "../browserScraper.js";

(async () => {
    //FC2 market info available
    //await simpleScraper.handleFC2("FC2-PPV-2885137", "mp4")
    //FC2 market info no longer available
    await browserScraper.init({
        logLevel: 'info',
    });
    await browserScraper.handleFC2_hub("FC2-PPV-1410419", "mp4")
})()