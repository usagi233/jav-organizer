import parser from "../parser.js";
(async () => {
    //FC2 market info available
    //await parser.handleFC2("FC2-PPV-2885137", "mp4")
    //FC2 market info no longer available
    await parser.handleFC2("FC2-PPV-1410419", "mp4")
})()