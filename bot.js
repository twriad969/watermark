const { Telegraf } = require('telegraf');
const express = require('express');
const axios = require('axios');
const { URLSearchParams } = require('url');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => ctx.reply('Hello! Send me a photo and I will watermark it for you.'));

bot.on('photo', async (ctx) => {
  try {
    const fileId = ctx.message.photo.pop().file_id;
    const file = await ctx.telegram.getFileLink(fileId);
    const mainImageUrl = file.href;

    const watermarkUrl = 'https://i.ibb.co/n6tHyjw/20240627-001522.png';
    const params = new URLSearchParams({
      mainImageUrl,
      markImageUrl: watermarkUrl,
      markRatio: '0.5',
      position: 'center'
    });

    const response = await axios.get(`https://quickchart.io/watermark`, { params, responseType: 'arraybuffer' });
    const watermarkedImage = Buffer.from(response.data, 'binary');

    await ctx.replyWithPhoto({ source: watermarkedImage }, { caption: ctx.message.caption });
  } catch (error) {
    console.error(error);
    ctx.reply('Failed to watermark the image.');
  }
});

const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  bot.launch();
});
