const fs = require('fs');
const express = require('express');
const app = express();
const exec = require('child_process').exec;
const port = 2333;



app.listen(port, () => {
    console.log("Listening on " + port);
    exec('start http://127.0.0.1:2333',(err,stdout,stderr) => {
        if (err) return console.log(err);
    });
})

app.get('/',(req,res) => {
    fs.readFile('index.html','utf-8',(err,contents) => {
        res.send(contents);
    })
})

app.post('/',(req,res) => {

})