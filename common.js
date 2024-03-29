import fs from 'fs'
import path from 'path'
import cheerio from 'cheerio'

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
Assume title can be obtained by using one selector,
also acts as an check on selector string and the webpage
*/
function getTitle($,selector){
    let title = $(selector).text();
    if (title == null || title == ''){
        throw new Error("GetTitle: Selector or webpage error");
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

function removeIllegalChar(string){
    return string.replace(/[\s\\\/\＼\／:：\?\!\？\！\"\'\<\>\*]/g,'');
}

function limitLength(string) {
    if (string.length > 80) {
        return string.substring(0, 80)
    }else{
        return string
    }
}

function combineResults(brand,descriptor,cast,title,extension){
    let result = `[${brand}][${descriptor}][${cast}][${limitLength(title)}]${extension}`
    return removeIllegalChar(result)
}

function renameFile(dir, filename,extension,result){
    console.log("Result: " + result);
    const oldPath = path.resolve(dir,`${filename}${extension}`);
    const newPath = path.resolve(dir, result);
    if (oldPath === newPath){
        console.log("No operation");
    }else{
        fs.rename(oldPath,newPath, (err) => {
            if (err){
                console.log(err);
            }
        })
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    parseFilename,
    extractString,
    getTitle,
    combineCastNames,
    combineResults,
    removeIllegalChar,
    renameFile
}