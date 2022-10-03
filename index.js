const express = require('express');
const {RtcTokenBuilder, RtcRole} = require('agora-access-token');

require('dotenv').config();
const APP_ID = process.env.APP_ID;
const APP_CERTIFICATE = process.env.APP_CERTIFICATE;
//const PORT = process.env.PORT; not working idk why
const PORT = 8080;

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
    // get uid
    let uid = req.query.uid;
    if (!uid || uid == '')
        uid = 0;
    // get role
    let role = RtcRole.SUBSCRIBER;
    if (req.query.role == 'publisher')
        role = RtcRole.PUBLISHER;
    // get expire time
    let expireTime = req.query.expireTime;
    if (!expireTime || expireTime == '')
        expireTime = 7200; // default 2 hours
    else
        expireTime = parseInt(expireTime, 10);
    // calculate privilege expire time
    const currentTime = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTime + expireTime;
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
    let channelName = Math.floor(Math.random() * 1000000000); // channel name is 0 to 1 billion (not sure what the limits of a valid channel b)
    return channelName.toString();
}

function printQueues()
{
    var str = "Volunteer Queue: ";
    for(var i = 0; i < volunteerQueue.items.length; i++)
        str += volunteerQueue.items[i].id + ", ";
    str += "\nBeneficiary Queue: "
    for(var i = 0; i < beneficiaryQueue.items.length; i++)
        str += beneficiaryQueue.items[i].id + ", ";
    console.log(str);
}

const handleCaller = (req, res) => 
{
    const user_id = req.query.id;
    const user_type = req.query.type;
    const user = { id: user_id, type: user_type };
    if (!user.type || (user.type != 'volunteer' && user.type != 'beneficiary'))
        return res.status(500).json({ 'error': 'user type is invalid' });

    let channelName = '';
    let vol_id = '';
    let ben_id = '';
    switch (user.type)
    {
        case 'volunteer':
            if (beneficiaryQueue.isEmpty())     // no beneficiaries waiting => enqueue this user until one is
            {
                volunteerQueue.enqueue(user);
                printQueues();
            }    
            else                                // there is a beneficiary waiting => generate a channel name, dequeue the beneficiary, and then return channel name
            {
                channelName = generateChannelName();
                vol_id = user.id;
                ben_id = beneficiaryQueue.dequeue().id;
                printQueues();

                return res.json({ 'beneficiary_id': ben_id, 'volunteer_id': vol_id, 'channelName': channelName });
            }
            break;
        case 'beneficiary':
            if (volunteerQueue.isEmpty())       // no volunteers waiting => enqueue this user until one is
            {
                beneficiaryQueue.enqueue(user);
                printQueues();
            }   
            else                                // there is a volunteer waiting => 
            {
                channelName = generateChannelName();
                ben_id = user.id;
                vol_id = volunteerQueue.dequeue().id;
                printQueues();

                return res.json({ 'beneficiary_id': ben_id, 'volunteer_id': vol_id, 'channelName': channelName });
            }
            break;
    }
}

// this does not yet send the channel name to the user waiting in queue
app.get('/new_caller', handleCaller);




app.listen(PORT, () => { console.log(`Listening on port: ${PORT}`); });