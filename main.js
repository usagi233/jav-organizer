'use strict'
import fs from 'fs'
import path from 'path'
import { ArgumentParser } from 'argparse'

import common  from './common.js'
import simpleScraper from './simpleScraper.js'
import browserScraper from './browserScraper.js'

let currentDirectory = null;
let args = null;

const vidExt = ['.mp4', '.mkv', '.avi', '.wmv'];

init().then(probeDirectory);

async function init(){
    const argParser = new ArgumentParser();
    argParser.add_argument(
        '-s','--show',
        {
            help: 'Show chrome'
        }
    )
    argParser.add_argument(
        '-d','--directory',
        {
            help: 'Absolute path of directory'
        }
    )
    args = argParser.parse_args();

    let showChrome = false;
    if (args.show == "true"){
        showChrome = true;
    }
    
    let launchOptions = null;
    if (showChrome){
        launchOptions = {
            logLevel: 'info',
        }
    }else{
        launchOptions = {
            logLevel: 'silent',
            chromeFlags: ['--headless']
        }
    }
    
    await browserScraper.init(launchOptions);
}

async function probeDirectory(){
    currentDirectory = args.directory;
    if (currentDirectory == null || currentDirectory == ""){
        console.log("Directory is required as a parameter");
        chrome.kill();
        process.exit(1);
    }
    console.log("Probing " + currentDirectory);
    fs.readdir(currentDirectory, async (err, files) => {
        if (err){
            console.log("Failed to probe directory");
            browserScraper.kill()
            process.exit(1);
        }
        for (let i=0;i<files.length;i++){
            const file = files[i];
            console.log("File: " + file)
            const extension = path.extname(file);
            if (vidExt.includes(extension)) {
                let filename = path.basename(file,extension);
                const upperFilename = filename.toUpperCase();
                try {
                    if (upperFilename.includes("CARIB") && upperFilename.includes("PR")){
                        await simpleScraper.handleCaribpr(currentDirectory, filename, extension);
                    }else if (upperFilename.includes("CARIB") && !upperFilename.includes("PR")){
                        await simpleScraper.handleCarib(currentDirectory, filename, extension);
                    }else if (upperFilename.includes("1PON")){
                        await browserScraper.handle1pon(currentDirectory, filename, extension);
                    }else if (upperFilename.includes("HEYDOUGA")){
                        await simpleScraper.handleHeydouga(currentDirectory, filename, extension);
                    }else if (upperFilename.includes("HEYZO")){
                        await simpleScraper.handleHeyzo(currentDirectory, filename, extension);
                    }else if (upperFilename.includes("10MU")){
                        await simpleScraper.handle10mu(currentDirectory, filename, extension);
                    }else if (upperFilename.includes("FC2")){
                        await browserScraper.handleFC2_hub(currentDirectory, filename, extension);
                        //await simpleScraper.handleFC2_market(currentDirectory, filename, extension);
                    }else{
                        const regexp = /[A-Z]{2,5}[-_]?\d{2,5}\w*/;
                        let attempt = common.extractString(upperFilename,regexp);
                        if (attempt == null){
                            console.log("Skipped: " + filename);
                        }else{
                            await browserScraper.handleCensored(currentDirectory, filename,extension,attempt);
                        }
                    }
                }catch (err) {
                    console.log(err.message)
                }
                
            }
        }
        
        
        console.log("Done")
        browserScraper.kill();
    });
}