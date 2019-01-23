'use strict'
const fs = require('fs')
const path = require('path')
const util = require('util');
const request = require('request');
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const ArgumentParser = require('argparse').ArgumentParser;

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
    console.log("Initilization complete");
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
        for (let i=0;i<files.length;i++){
            const file = files[i];
            const extension = path.extname(file);
            let filename = path.basename(file,extension);
            const upperFilename = filename.toUpperCase();
            if (upperFilename.includes("CARIB") && upperFilename.includes("PR")){
                await handleCaribpr(filename,extension);
            }else if (upperFilename.includes("CARIB") && !upperFilename.includes("PR")){
                await handleCarib(filename,extension);
            }else if (upperFilename.includes("1PON")){
                await handle1pon(filename,extension);
            }else if (upperFilename.includes("HEYDOUGA")){
                await handleHeydouga(filename,extension);
            }else if (upperFilename.includes("HEYZO")){
                await handleHeyzo(filename,extension);
            }else if (upperFilename.includes("10MU")){
                await handle10mu(filename,extension);
            }else if (upperFilename.includes("FC2")){
                await handleFC2(filename,extension);
            }else{
                const regexp = /[A-Z]{2,5}[-_]?\d{2,5}\w*/;
                let attempt = extractString(upperFilename,regexp);
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
        console.log("Done")
        chrome.kill();
    });
}

async function handleCaribpr(filename,extension){
    const props = {
        "filename": filename,
        "extension": extension,
        "brand":"CaribbeanPR",
        "descriptorRE": /\d{6}_\d{3}[-_\w]*/,
        "codeRE": /\d{6}_\d{3}/,
        "url": (code) => {return `https://www.caribbeancompr.com/moviepages/${code}/index.html`},
        "titleSelector": 'div.video-detail h1',
        "castContainerSelector": 'div.movie-info dd',
        "castElementSelector": 'a'
    }
    await handleUncensored(props);
}

async function handleCarib(filename,extension){
    const props = {
        "filename": filename,
        "extension": extension,
        "brand":"Caribbean",
        "descriptorRE": /\d{6}-\d{3}[-_\w]*/,
        "codeRE": /\d{6}-\d{3}/,
        "url": (code) => {return `https://www.caribbeancom.com/moviepages/${code}/index.html`},
        "titleSelector": 'div.movie-info h1[itemprop="name"]',
        "castContainerSelector": 'div.movie-info',
        "castElementSelector": 'span[itemprop="name"]'
    }
    await handleUncensored(props);
}

async function handle1pon(filename,extension){
    console.log("->Processing 1pon: " + filename);
    const descriptorRE = /\d{6}_\d{3}[-_\w]*/;
    const codeRE = /\d{6}_\d{3}/;
    const parseResult = parseFilename(filename,descriptorRE,codeRE);
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
    const cast = combineCastNames(castAnchors);
    const result = combineResults("1pondo",descriptor,cast,title,extension);
    renameFile(filename,extension,result);
}

async function handleHeyzo(filename,extension){
    const props = {
        "filename": filename,
        "extension": extension,
        "brand":"Heyzo",
        "descriptorRE": /heyzo[-_\w]*\d{4}[-_\w]*/i,
        "codeRE": /\d{4}/,
        "url": (code) => {return `http://www.heyzo.com/moviepages/${code}/index.html`},
        "titleSelector": 'div#movie h1',
        "castContainerSelector": 'table.movieInfo tr.table-actor',
        "castElementSelector": 'a'
    }
    await handleUncensored(props);
}

async function handleHeydouga(filename,extension){
    const props = {
        "filename": filename,
        "extension": extension,
        "brand":"Heydouga",
        "descriptorRE": /heydouga[-_\w]*\d{4}-\d{3,4}[-_\w]*/i,
        "codeRE": /\d{4}-\d{3,4}/,
        "url": (code) => {return `http://www.heydouga.com/moviepages/${code.replace('-','\/')}/index.html`},
        "titleSelector": 'div#title-bg h1',
        "castContainerSelector": 'div#movie-info ul:nth-child(2) li:nth-of-type(2) span:nth-child(2)',
        "castElementSelector": 'a'
    }
    await handleUncensored(props);
}

async function handle10mu(filename,extension){
    const props = {
        "filename": filename,
        "extension": extension,
        "brand":"10musume",
        "descriptorRE": /\d{6}_\d{2}[-_\w]*/,
        "codeRE": /\d{6}_\d{2}/,
        "url": (code) => {return `https://www.10musume.com/moviepages/${code}/index.html`},
        "titleSelector": 'div.detail-info__meta dd:nth-of-type(1)',
        "castContainerSelector": 'div.detail-info__meta dd:nth-of-type(4)',
        "castElementSelector": 'a'
    }
    await handleUncensored(props);
}

async function handleFC2(filename,extension){
    const props = {
        "filename": filename,
        "extension": extension,
        "brand":"FC2",
        "descriptorRE": /fc2[_-]?(ppv)?[_-]?\d{6,7}[-_\w]*/i,
        "codeRE": /\d{6,7}/,
        "url": (code) => {return `https://adult.contents.fc2.com/article_search.php?id=${code}`},
        "titleSelector": 'h2.title_bar',
        "castContainerSelector": 'div.main_info_block dd:nth-of-type(5)',
        "castElementSelector": 'a'
    }
    await handleUncensored(props);
}


async function handleUncensored(props){
    console.log(`->Processing ${props.brand}: ${props.filename}`);
    const parseResult = parseFilename(props.filename,props.descriptorRE,props.codeRE);
    if (parseResult == null) return;
    const descriptor = parseResult.descriptor;
    const code = parseResult.code;
    let url = props.url(code);
    const $ = await gotoSite(url);
    if ($ == null) return;
    const title = await getTitle($,props.titleSelector);
    if (title == null) return;
    const castContainer = $(props.castContainerSelector);
    const castElements = cheerio(castContainer).find(props.castElementSelector);
    const cast = combineCastNames(castElements);
    const result = combineResults(props.brand,descriptor,cast,title,props.extension);
    //console.log(result + "\n");
    renameFile(props.filename,props.extension,result);
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
    let title = await getTitle($,'h3.post-title a');
    if (title == null) return;
    title = title.replace(descriptor,'');
    let brand = $('div#video_maker a').text();
    brand = removeIllegalChar(brand);
    const castElements = $('div#video_cast').find('span.star');
    const cast = combineCastNames(castElements);
    const result = combineResults(brand,attempt,cast,title,extension);
    renameFile(filename,extension,result);
}

function extractString(string,regexp){
    const extract = string.match(regexp);
    if (extract == null){
        console.log("Unable to extract from " + string);
        return null;
    }else{
        return extract[0];
    }
}

/*
Extract descriptor which includes movie code,
sometimes with additional info such as resolution,
and the most important movie code.
*/
function parseFilename(filename,descriptorRE,codeRE){
    const spaceRemoved = filename.replace(/\s/g,'');
    const descriptor = extractString(spaceRemoved,descriptorRE);
    if (descriptor == null) return null;
    console.log("Descriptor: " + descriptor);
    const code = extractString(descriptor,codeRE);
    if (code == null) return null;
    console.log("Code: " + code);
    return {
        "descriptor" : descriptor,
        "code" : code
    }
}

function formatCensoredDescriptor(string){
    let descriptor = extractString(string,/[A-Z]{2,5}[-_]?\d{2,5}/);
    if (descriptor.includes('-')){
        return descriptor;
    }
    if (descriptor.includes('_')){
        descriptor = descriptor.replace('_','-');
    }
    if (!descriptor.includes('-')){
        const letters = extractString(descriptor,/[A-Z]{2,5}/);
        const numbers = extractString(descriptor,/\d{2,5}/);
        descriptor = letters + '-' + numbers;
    }
    return descriptor;
}

/*
Assume title can be obtained by using one selector,
also acts as an check on selector string and the webpage
*/
async function getTitle($,selector){
    let title = $(selector).text();
    if (title == null || title == ''){
        console.log("Selector or webpage error");
        await sleep(2000);
        return null;
    }else{
        //Remove invalid symbols for file name
        title = removeIllegalChar(title);
        return title;
    }
}

/*
Combine text from multiple HTML elements,
specifically used for concatenating cast names
*/
function combineCastNames(elements){
    let cast = '';
    for (let i=0;i<elements.length;i++){
        cast += cheerio(elements[i]).text();
        if (i != elements.length-1){
            cast += '&';
        }
    }
    cast = cast.replace(/\s/g,'');
    return cast;
}

function combineResults(brand,descriptor,cast,title,extension){
    return `[${brand}][${descriptor}][${cast}][${title}]${extension}`;
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

function renameFile(filename,extension,result){
    console.log("Result: " + result);
    const oldPath = path.resolve(currentDirectory,filename+extension);
    const newPath = path.resolve(currentDirectory,result);
    if (oldPath == newPath){
        console.log("No operation");
    }else{
        fs.rename(oldPath,newPath, (err) => {
            if (err){
                console.log(err);
            }
        })
    }
}

function removeIllegalChar(string){
    return string.replace(/[\s\\\/\＼\／:：\?\!\？\！\"\'\<\>]/g,'');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

