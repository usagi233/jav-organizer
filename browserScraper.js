'use strict'
import request from "request";
import util from 'util'
import chromeLauncher from 'chrome-launcher'
import puppeteer from 'puppeteer-core'
import cheerio from 'cheerio'

import common from "./common.js";

let chrome,sitePage,libPage,hubPage = null;
let libAvaliable = true;

async function init (launchOptions) {
    console.log("Initializing Chrome");
    try{
        chrome = await chromeLauncher.launch(launchOptions);
    }catch(err){
        console.log("Failed to launch Chrome. Make sure you have Chrome installed");
        process.exit(1);
    }
    
    const debugPort = chrome.port;
    const resp = await util.promisify(request)(`http://127.0.0.1:${debugPort}/json/version`);
    const {webSocketDebuggerUrl} = JSON.parse(resp.body);
    const browser = await puppeteer.connect({browserWSEndpoint: webSocketDebuggerUrl});
    
    sitePage = await browser.newPage();
    libPage = await browser.newPage();
    await libPage.goto("http://www.javlibrary.com/ja/");
    try{
        await libPage.waitFor('p[style="text-align:center"]',{timeout:10000});
        const agreeButton = await libPage.$('p[style="text-align:center"] input:nth-of-type(1)');
        await agreeButton.click();
        await libPage.goto("http://www.javlibrary.com/ja/")
        await libPage.waitFor('input#idsearchbox');
    }catch (err){
        console.log("Javlibrary not available, cencored movies will be ignored");
        libAvaliable = false;
    }

    hubPage = await browser.newPage();
    await hubPage.setViewport({width: 1920, height: 1080})
    await hubPage.goto("https://fc2hub.com/");
    try {
        await hubPage.waitFor('form#search', {timeout: 10000});
    }catch (err) {
        console.log("FC2 hub not available.")
    }

    console.log("Initialization complete");
}

function kill () {
    chrome.kill();
}

async function handle1pon(dir, filename,extension){
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
    common.renameFile(dir, filename,extension,result);
}

async function handleCensored(dir, filename,extension,attempt){
    if (!libAvaliable) {
        console.log('JAV library not available. Skipping ' + filename);
        return;
    }

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
    common.renameFile(dir, filename,extension,result);
}

async function handleFC2_hub(dir, filename, extension) {
    console.log("->Processing FC2 (Hub): " + filename);
    const descriptorRE = /fc2[_-]?(ppv)?[_-]?\d{6,7}[-_\w]*/i;
    const codeRE = /\d{6,7}/;
    const parseResult = common.parseFilename(filename,descriptorRE,codeRE);
    const { descriptor, code } = parseResult;

    await hubPage.goto("https://fc2hub.com/");
    await hubPage.type('div.container-fluid input[name="kw"]', code)
    await hubPage.keyboard.press('Enter');
    await hubPage.waitForNavigation();
    const html = await hubPage.content();
    const $ = cheerio.load(html,{decodeEntities: false})
    const description = $('meta[name="description"]').attr('content');
    let segments = description.split('|');
    const title = segments[1].replace(/\s/g, '')
    const uploader = segments[2].substring(4).replace(/\s/g, '')
    const result = common.combineResults('FC2', descriptor, uploader, title, extension);
    common.renameFile(dir, filename, extension, result);
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


export default {
    init,
    kill,
    handle1pon,
    handleCensored,
    handleFC2_hub
}