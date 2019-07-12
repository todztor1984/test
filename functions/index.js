const functions = require('firebase-functions');
const request = require('request-promise');

const admin = require('firebase-admin');
admin.initializeApp();

const region = 'asia-east2';
const runtimeOpts = {
  timeoutSeconds: 4,
  memory: "2GB"
};

const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message';
const LINE_HEADER = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer aUb36Qh7ErG38TSYOlnqN0Jcr+p7LYWr9/9MgCYEXJWFIWq5l4x2HVxLcsOe9jhpEX3cR6tURtB7mVYT76rvjQNrnqQgL4Ej4dzQr1xemT3y0Yng9sowMGwODTaJOugDEcy+LnTYOIok6pe8lOB+5QdB04t89/1O/w1cDnyilFU=`
};

exports.webhook = functions.https.onRequest((req, res) => {
    let event = req.body.events[0]
    switch (event.type) {
      case 'message':
        if (event.message.type === 'image') {
          // [8.3]
          doImage(event)
        } else if (event.message.type === 'text') {
          // [8.2]
          postToDialogflow(req);
        } else {
          // [8.1]
        }
        break;
      case 'postback': {
        // [8.4]
        break;
      }
    }
    return null;
  });



const postToDialogflow = req => {
  req.headers.host = "bots.dialogflow.com";
  return request.post({
    uri: "https://bots.dialogflow.com/line/dc2b7260-9ceb-4b36-8573-27d0cb636ec6/webhook",
    headers: req.headers,
    body: JSON.stringify(req.body)
  });
};

// Push Message
const push = (userId, msg, quickItems) => {
    return request.post({
      headers: LINE_HEADER,
      uri: `${LINE_MESSAGING_API}/push`,
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: msg, quickReply: quickItems }]
      })
    })
  }
  
  // Reply Message
  const reply = (token, payload) => {
    return request.post({
      uri: `${LINE_MESSAGING_API}/reply`,
      headers: LINE_HEADER,
      body: JSON.stringify({
        replyToken: token,
        messages: [payload]
      })
    })
  }
  
  // Broadcast Messages
  const broadcast = (msg) => {
    return request.post({
      uri: `${LINE_MESSAGING_API}/broadcast`,
      headers: LINE_HEADER,
      body: JSON.stringify({
        messages: [{ type: "text", text: msg }]
      })
    })
  };


const doImage = async (event) => {
    const path = require("path");
    const os = require("os");
    const fs = require("fs");
    
    // กำหนด URL ในการไปดึง binary จาก LINE กรณีผู้ใช้อัพโหลดภาพมาเอง
    let url = `${LINE_MESSAGING_API}/${event.message.id}/content`;
    
    // ตรวจสอบว่าภาพนั้นถูกส่งมจาก LIFF หรือไม่
    if (event.message.contentProvider.type === 'external') {
      // กำหนด URL รูปภาพที่ LIFF ส่งมา 
      url = event.message.contentProvider.originalContentUrl;
    }
    
    // ดาวน์โหลด binary
    let buffer = await request.get({
      headers: LINE_HEADER,
      uri: url,
      encoding: null // แก้ปัญหา binary ไม่สมบูรณ์จาก default encoding ที่เป็น utf-8
    });
    
    //  ด้
    const tempLocalFile = path.join(os.tmpdir(), 'temp.jpg');
    await fs.writeFileSync(tempLocalFile, buffer);
    
    // กำหนดชื่อ bucket ใน Cloud Storage for Firebase
    const bucket = admin.storage().bucket('gs://project-test-246402.appspot.com/');
    
    // อัพโหลดไฟล์ขึ้น Cloud Storage for Firebase
    await bucket.upload(tempLocalFile, {
      destination: `${event.source.userId}.jpg`, // ให้ชื่อไฟล์เป็น userId ของ LINE
      metadata: { cacheControl: 'no-cache' }
    });
    
    /// ลบไฟล์ temp หลังจากอัพโหลดเสร็จ
    fs.unlinkSync(tempLocalFile)
    
    // ตอบกลับเพื่อ handle UX เนื่องจากทั้งดาวน์โหลดและอัพโหลดต้องใช้เวลา
    reply(event.replyToken, { type: 'text', text: 'รอสักครู่นะครับ...' });
  }

  exports.logoDetection = functions.region(region).runWith(runtimeOpts)
  .storage.object()
  .onFinalize(async (object) => {
  const fileName = object.name // ดึงชื่อไฟล์มา
  const userId = fileName.split('.')[0] // แยกชื่อไฟล์ออกมา ซึ่งมันก็คือ userId
  
  // ทำนายโลโกที่อยู่ในภาพด้วย Cloud Vision API
  const [result] = await client.logoDetection(`gs://${object.bucket}/${fileName}`);
  const logos = result.logoAnnotations;
  
  // เอาผลลัพธ์มาเก็บใน array ซึ่งเป็นโครงสร้างของ Quick Reply
  let itemArray = []
  logos.forEach(logo => {
    if (logo.score >= 0.7) { // ค่าความแม่นยำของการทำนายต้องได้ตั้งแต่ 70% ขึ้นไป
      itemArray.push({
        type: 'action',
        action: {
          type: 'postback', // action ประเภท postback
          label: logo.description, // ชื่อที่จะแสดงในปุ่ม Quick Reply
          data: `team=${logo.description}`, // ส่งข้อมูลทีมกลับไปแบบลับๆ
          displayText: logo.description // ชื่อที่จะถูกส่งเข้าห้องแชทหลังจากคลิกปุ่ม Quick Reply
        }
      });
    }
  })
  
  // กำหนดตัวแปรมา 2 ตัว
  let msg = '';
  let quickItems = null;
  
  // ตรวจสอบว่ามีผลลัพธ์การทำนายหรือไม่
  if (itemArray.length > 0) {
    msg = 'เป็นทีมที่คุณกำลังหาอยู๋หรือไม่';
    quickItems = { items: itemArray };
  } else {
    msg = 'ไม่พบโลโกในภาพ ลองส่งรูปมาใหม่ซิ';
    quickItems = null;
  }
  
  // ส่งข้อความหาผู้ใช้ว่าพบโลโกหรือไม่ พร้อม Quick Reply(กรณีมีผลการทำนาย)
  push(userId, msg, quickItems)
});