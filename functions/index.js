const functions = require('firebase-functions');
const request = require('request-promise');

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message';
const LINE_HEADER = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer aUb36Qh7ErG38TSYOlnqN0Jcr+p7LYWr9/9MgCYEXJWFIWq5l4x2HVxLcsOe9jhpEX3cR6tURtB7mVYT76rvjQNrnqQgL4Ej4dzQr1xemT3y0Yng9sowMGwODTaJOugDEcy+LnTYOIok6pe8lOB+5QdB04t89/1O/w1cDnyilFU=`
};

exports.webhook = functions.https.onRequest((req, res) => {
    if (req.method === "POST") {
      let event = req.body.events[0]
      if (event.type === "message" && event.message.type === "text") {
        postToDialogflow(req);
      } else {
        reply(req);
      }
    }
    return res.status(200).send(req.method);
  });
  
  const reply = req => {
    return request.post({
      uri: `${LINE_MESSAGING_API}/reply`,
      headers: LINE_HEADER,
      body: JSON.stringify({
        replyToken: req.body.events[0].replyToken,
        messages: [
          {
            type: "text",
            text: JSON.stringify(req.body)
          }
        ]
      })
    });
  };
  
  const postToDialogflow = req => {
    req.headers.host = "bots.dialogflow.com";
    return request.post({
      uri: "https://bots.dialogflow.com/line/dc2b7260-9ceb-4b36-8573-27d0cb636ec6/webhook",
      headers: req.headers,
      body: JSON.stringify(req.body)
    });
  };