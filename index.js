const express = require('express');
const {RtcTokenBuilder, RtcRole} = require('agora-access-token');

require('dotenv').config();
const APP_ID = process.env.APP_ID;
const APP_CERTIFICATE = process.env.APP_CERTIFICATE;
const PORT = process.env.PORT;

const app = express();

/********************
 * TOKEN GENERATION *
 *******************/

// Ensures that we get a new token for every request
const nocache = (req, res, next) => 
{
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
}

const generateAccessToken = (req, res) =>
{
    // set response header
    res.header('Access-Control-Allow-Origin', '*');
    // get channel name
    const channelName = req.query.channelName;
    if (!channelName)
        return res.status(500).json({ 'error': 'channel is required' });
    // set uid = 0 so that token can be used by any user
    let uid = 0;
    // set role to Publisher
    let role = RtcRole.PUBLISHER;
    // get expire time
    let expireTime = req.query.expireTime;
    if (!expireTime || expireTime == '')
        expireTime = 7200; // default 2 hours
    else
        expireTime = parseInt(expireTime, 10);
    // calculate privilege expire time
    const currentTime = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTime + expireTime;
    console.log(privilegeExpireTime);
    // build token
    const token = RtcTokenBuilder.buildTokenWithUid(APP_ID, APP_CERTIFICATE, channelName, uid, role, privilegeExpireTime);
    // return token
    return res.json({ 'token': token });
}

app.get('/access_token', nocache, generateAccessToken);

/***************
 * USER QUEUES *
 **************/
const Queue = require('./queue');
let volunteerQueue = new Queue();
let beneficiaryQueue = new Queue();

function generateChannelName()
{
    let channelName = Math.floor(Math.random() * 9999999999); // channel name is 0 to 1 trillion
    while (invalidChannelList.find(element => element == channelName.toString()))
    {
        channelName = Math.floor(Math.random() * 9999999999);
    }
    return channelName.toString();
}

function printQueues()
{
    var str = `\n[${volunteerQueue.items.length}]Volunteer Queue: `;
    for(var i = 0; i < volunteerQueue.items.length; i++)
        str += volunteerQueue.items[i].id + ", ";
    str += `\n[${beneficiaryQueue.items.length}]Beneficiary Queue: `
    for(var i = 0; i < beneficiaryQueue.items.length; i++)
        str += beneficiaryQueue.items[i].id + ", ";
    console.log(str);
}

const enqueueUser = (req, res) => 
{
    const user_id = req.query.id;
    const user_type = req.query.type;
    const user = { id: user_id, type: user_type , channel: ""};
    if (!user.type || (user.type != 'v' && user.type != 'b'))
        return res.status(500).json({ 'error': 'user type is invalid' });

    switch (user.type)
    {
        case 'v':
            if (beneficiaryQueue.isEmpty())     // no beneficiaries waiting => enqueue this user until one is
            {
                user.channel = generateChannelName();
                volunteerQueue.enqueue(user);
                printQueues();
                
                console.log (`Sending channel ${user.channel} to user ${user.id}.`);
                return res.json({ 'channelName': user.channel });
            }    
            else                                // there is a beneficiary waiting => generate a channel name, dequeue the beneficiary, and then return channel name
            {
                user.channel = beneficiaryQueue.dequeue().channel;
                printQueues();

                console.log (`Sending channel ${user.channel} to user ${user.id}.`);
                return res.json({ 'channelName': user.channel });
            }
        case 'b':
            if (volunteerQueue.isEmpty())       // no volunteers waiting => enqueue this user until one is
            {
                user.channel = generateChannelName();
                beneficiaryQueue.enqueue(user);
                printQueues();

                console.log (`Sending channel ${user.channel} to user ${user.id}.`);
                return res.json({ 'channelName': user.channel });
            }   
            else                                // there is a volunteer waiting => 
            {
                user.channel = volunteerQueue.dequeue().channel;
                printQueues();

                console.log (`Sending channel ${user.channel} to user ${user.id}.`);
                return res.json({ 'channelName': user.channel });
            }
    }
}

app.get('/gen_channel', enqueueUser);

// emergency flush queues
const resetQueues = (req, res) => 
{
    const cert = req.query.cert;
    if (cert == APP_CERTIFICATE)
    {
        while (!volunteerQueue.isEmpty)
            volunteerQueue.dequeue;
        while (!beneficiaryQueue.isEmpty)
            beneficiaryQueue.dequeue;

        return res.status(200).json({ 'success': 'queues flushed' });
    }
    else
        return res.status(500).json({ 'error': 'certificate is invalid' });
}

app.get('/flush_queues', resetQueues);

// invalidate channel after user leaves
// this prevents a user from connecting to a channel that their partner already left
let invalidChannelList = [];
const invalidateChannel = (req, res) =>
{
    const channel = req.query.channel;
    invalidChannelList.push(channel);
    console.log(`Invalid channels: ${invalidChannelList}`);
    return res.status(200).json({ 'success': true});
}

app.get('/invalidate_channel', invalidateChannel);

// check if channel is valid before joining
const validateChannel = (req, res) =>
{
    const channel = req.query.channel;
    if (invalidChannelList.find(element => element == channel))
        return res.json({ 'is_valid': false });
    else
        return res.json({ 'is_valid': true });
}

app.get('/validate_channel', validateChannel);

app.listen(PORT, () => { console.log(`Listening on port: ${PORT}`); });