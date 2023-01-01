'use strict'
import request from "request";
import util from 'util'
import cheerio from 'cheerio'

import common from "./common.js";


async function handleCaribpr(dir, filename,extension){
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
    await handleUncensored(dir, props);
}

async function handleCarib(dir, filename,extension){
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
    await handleUncensored(dir, props);
}

async function handleHeyzo(dir, filename,extension){
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
    await handleUncensored(dir, props);
}

async function handleHeydouga(dir, filename,extension){
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
    await handleUncensored(dir, props);
}

async function handle10mu(dir, filename,extension){
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
    await handleUncensored(dir, props);
}

async function handleFC2_market(dir, filename,extension){
    const props = {
        "filename": filename,
        "extension": extension,
        "brand":"FC2",
        "descriptorRE": /fc2[_-]?(ppv)?[_-]?\d{6,7}[-_\w]*/i,
        "codeRE": /\d{6,7}/,
        "url": (code) => {return `https://adult.contents.fc2.com/article/${code}/`},
        "titleSelector": 'div.items_article_headerInfo > h3',
        "castContainerSelector": 'section.items_comment_sellerBox div div h4',
        "castElementSelector": 'h4 > a:first-child'
    }
    try {
        await handleUncensored(dir, props);
    }catch (err) {
        console.log(err.message)
        
    }
}

async function handleUncensored(dir, props){
    console.log(`->Processing ${props.brand}: ${props.filename}`);
    const parseResult = common.parseFilename(props.filename,props.descriptorRE,props.codeRE);
    if (parseResult == null) return;
    const descriptor = parseResult.descriptor;
    const code = parseResult.code;
    let url = props.url(code);

    const resp = await util.promisify(request)(url);
    const contents = resp.body;
    const $ = cheerio.load(contents,{decodeEntities: false});

    if ($ == null) return;
    const title = common.getTitle($,props.titleSelector);
    if (title == null) return;
    const castContainer = $(props.castContainerSelector);
    const castElements = cheerio(castContainer).find(props.castElementSelector);
    const cast = common.combineCastNames(castElements);
    const result = common.combineResults(props.brand,descriptor,cast,title,props.extension);
    
    common.renameFile(dir, props.filename,props.extension,result);
}


export default {
    handle10mu,
    handleCarib,
    handleCaribpr,
    handleFC2_market,
    handleHeydouga,
    handleHeyzo
}