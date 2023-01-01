'use strict'
import fs from 'fs'
import path from 'path'
import util from 'util'
import request from 'request'
import chromeLauncher from 'chrome-launcher'
import puppeteer from 'puppeteer-core'
import cheerio from 'cheerio'
import { ArgumentParser } from 'argparse'

import common  from './common.js'
import parser from './parser.js'

let chrome,sitePage,libPage = null;
let currentDirectory = null;
let libAvaliable = true;
let args = null;

init().then(probeDirectory);

async function init(){
    const argParser = new ArgumentParser();
    argParser.addArgument(
        ['-s','--show'],
        {
            help: 'Show chrome'
        }
    )
    argParser.addArgument(
        ['-d','--directory'],{
            help: 'Absolute path of directory'
        }
    )
    args = argParser.parseArgs();

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
    
    console.log("Initializing");
    try{
        chrome = await chromeLauncher.launch(launchOptions);
    }catch(err){
        console.log("Failed to launch Chrome. Make sure you have Chrome installed");
        process.exit(1);
    }
    
    const debugPort = chrome.port;
    const resp = await util.promisify(request)(`http://localhost:${debugPort}/json/version`);
    const {webSocketDebuggerUrl} = JSON.parse(resp.body);
    const browser = await puppeteer.connect({browserWSEndpoint: webSocketDebuggerUrl});
    
    libPage = await browser.newPage();
    await libPage.goto("http://www.javlibrary.com/ja/");
    try{
        await libPage.waitFor('p[style="text-align:center"]',{timeout:10000});
        const agreeButton = await libPage.$('p[style="text-align:center"] input:nth-of-type(1)');
        await agreeButton.click();
        await libPage.goto("http://www.javlibrary.com/ja/")
        await libPage.waitFor('input#idsearchbox');
    }catch (err){
        console.log("Javlibrary not avaliable, cencored movies will be ignored");
        libAvaliable = false;
    }

    sitePage = await browser.newPage();
    console.log("Initialization complete");
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
            chrome.kill();
            process.exit(1);
        }
        try {
            for (let i=0;i<files.length;i++){
                const file = files[i];
                const extension = path.extname(file);
                let filename = path.basename(file,extension);
                const upperFilename = filename.toUpperCase();
                if (upperFilename.includes("CARIB") && upperFilename.includes("PR")){
                    await parser.handleCaribpr(filename,extension);
                }else if (upperFilename.includes("CARIB") && !upperFilename.includes("PR")){
                    await parser.handleCarib(filename,extension);
                }else if (upperFilename.includes("1PON")){
                    await handle1pon(filename,extension);
                }else if (upperFilename.includes("HEYDOUGA")){
                    await parser.handleHeydouga(filename,extension);
                }else if (upperFilename.includes("HEYZO")){
                    await parser.handleHeyzo(filename,extension);
                }else if (upperFilename.includes("10MU")){
                    await parser.handle10mu(filename,extension);
                }else if (upperFilename.includes("FC2")){
                    await parser.handleFC2(filename,extension);
                }else{
                    const regexp = /[A-Z]{2,5}[-_]?\d{2,5}\w*/;
                    let attempt = common.extractString(upperFilename,regexp);
                    if (attempt == null){
                        console.log("Skipped: " + filename);
                    }else{
                        if (libAvaliable){
                            await handleCensored(filename,extension,attempt);
                        }else{
                            console.log("Skipped: " + filename);
                        }
                    }
                    
                }
            }
        }catch (err) {
            console.log(err)
        }
        
        console.log("Done")
        chrome.kill();
    });
}



async function handle1pon(filename,extension){
    console.log("->Processing 1pon: " + filename);
    const descriptorRE = /\d{6}_\d{3}[-_\w]*/;
    const codeRE = /\d{6}_\d{3}/;
    const parseResult = common.parseFilename(filename,descriptorRE,codeRE);
    if (parseResult == null) return;
    const descriptor = parseResult.descriptor;
    const code = parseResult.code;
    const url = `https://www.1pondo.tv/movies/${code}`;
    console.log("URL: " + url);
    const response = await sitePage.goto(url,{waituntil:'networkidle2'});
    if (!response.ok()){
        return console.log("HTTP Error");
    }
    const moreButton = await sitePage.$('div.movie-info button.see-more');
    await moreButton.click();
    await sitePage.waitFor('div.movie-detail');
    const contents = await sitePage.content();
    const $ = cheerio.load(contents,{decodeEntities: false});
    const title = await getTitle($,'div.movie-overview h1.h1--dense');
    if (title == null) return;
    const details = $('div.movie-detail').find('span.spec-content');
    const castElement = details[1];
    const castAnchors = cheerio(castElement).find('span');
    const cast = common.combineCastNames(castAnchors);
    const result = common.combineResults("1pondo",descriptor,cast,title,extension);
    common.renameFile(filename,extension,result);
}

async function handleCensored(filename,extension,attempt){
    console.log("->Processing: " + filename);
    const descriptor = formatCensoredDescriptor(attempt);
    console.log("Descriptor: " + descriptor);
    await libPage.type('input#idsearchbox',descriptor);
    await libPage.keyboard.press('Enter');
    await libPage.waitForNavigation('networkidle2');
    const contents = await libPage.content();
    const $ = cheerio.load(contents,{decodeEntities: false});
    let title = await common.getTitle($,'h3.post-title a');
    if (title == null) return;
    title = title.replace(descriptor,'');
    let brand = $('div#video_maker a').text();
    brand = common.removeIllegalChar(brand);
    const castElements = $('div#video_cast').find('span.star');
    const cast = common.combineCastNames(castElements);
    const result = common.combineResults(brand,attempt,cast,title,extension);
    renameFile(filename,extension,result);
}

function formatCensoredDescriptor(string){
    let descriptor = common.extractString(string,/[A-Z]{2,5}[-_]?\d{2,5}/);
    if (descriptor.includes('-')){
        return descriptor;
    }
    if (descriptor.includes('_')){
        descriptor = descriptor.replace('_','-');
    }
    if (!descriptor.includes('-')){
        const letters = common.extractString(descriptor,/[A-Z]{2,5}/);
        const numbers = common.extractString(descriptor,/\d{2,5}/);
        descriptor = letters + '-' + numbers;
    }
    return descriptor;
}



async function gotoSite(url){
    console.log("URL: " + url);
    try{
        const response = await sitePage.goto(url,{waituntil:'networkidle2'});
        if (!response.ok){
            console.log("HTTP Error");
            return null;
        }
    }catch (err){
        console.log("Failed to load URL" + err);
        return null;
    }
    try{
        const contents = await sitePage.content();
        return cheerio.load(contents,{decodeEntities: false});
    }catch (err){
        console.log("Most likely page is redirected");
        return null;
    }
}
