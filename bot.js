const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const { URLSearchParams } = require('url');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
let markRatio = '0.4';
let header = '';
let footer = '';
let recentImages = [];
let processedCount = 0;
let channels = [];

bot.start((ctx) => ctx.reply('Hello! Send me a photo and I will watermark it for you.'));

const watermarkImage = async (mainImageUrl, watermarkUrl, ratio) => {
  const params = new URLSearchParams({
    mainImageUrl,
    markImageUrl: watermarkUrl,
    markRatio: ratio,
    position: 'bottomLeft'
  });
  const response = await axios.get(`https://quickchart.io/watermark`, { params, responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary');
};

bot.on('photo', async (ctx) => {
  const processPhoto = async (fileId, caption, retry = 3) => {
    try {
      const file = await ctx.telegram.getFileLink(fileId);
      const mainImageUrl = file.href;
      const watermarkUrl = 'https://i.ibb.co/Sd0wFmP/20240731-193646.png';
      const watermarkedImage = await watermarkImage(mainImageUrl, watermarkUrl, markRatio);

      let customCaption = caption || '';

      if (caption) {
        const links = caption.match(/\bhttps?:\/\/\S+/gi);
        if (links) {
          customCaption = `${header ? header + '\n\n' : ''}` +
            `${links.map((link, index) => `👉 v${index + 1} : ${link}`).join('\n\n')}` +
            `${footer ? '\n\n' + footer : ''}`;
        }
      }

      recentImages.push({ image: watermarkedImage, caption: customCaption });
      processedCount++;

      await ctx.replyWithPhoto({ source: watermarkedImage }, { caption: customCaption });
    } catch (error) {
      console.error(error);
      if (retry > 0) {
        console.log(`Retrying... attempts left: ${retry}`);
        await processPhoto(fileId, caption, retry - 1);
      } else {
        ctx.reply('Failed to watermark the image.');
      }
    }
  };

  const fileId = ctx.message.photo.pop().file_id;
  const caption = ctx.message.caption;
  await processPhoto(fileId, caption);
});

bot.command('mark', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length === 2 && !isNaN(args[1])) {
    markRatio = args[1];
    ctx.reply(`Watermark ratio set to ${markRatio}`);
  } else {
    ctx.reply('Please provide a valid number for the watermark ratio, e.g., /mark 0.6');
  }
});

bot.command('header', (ctx) => {
  const text = ctx.message.text.replace('/header', '').trim();
  header = text;
  ctx.reply(`Header set to: ${header}`);
});

bot.command('footer', (ctx) => {
  const text = ctx.message.text.replace('/footer', '').trim();
  footer = text;
  ctx.reply(`Footer set to: ${footer}`);
});

bot.command('add', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length === 2) {
    const channel = args[1].replace('@', '').trim();
    if (!channels.includes(channel)) {
      channels.push(channel);
      ctx.reply(`Added channel: ${channel}. Please add the bot as an admin to this channel.`);
    } else {
      ctx.reply('This channel is already added.');
    }
  } else {
    ctx.reply('Please provide a valid channel ID or username, e.g., /add your_channel');
  }
});

bot.command('postnow', (ctx) => {
  const args = ctx.message.text.split(' ');
  let numImages = recentImages.length;

  if (args.length === 2 && !isNaN(args[1])) {
    numImages = Math.min(parseInt(args[1]), recentImages.length);
  }

  if (recentImages.length > 0) {
    if (channels.length > 0) {
      const channelButtons = channels.map(channel => Markup.button.callback(channel, `post_${channel}_${numImages}`));
      ctx.reply('Select a channel to post the images:', Markup.inlineKeyboard(channelButtons, { columns: 1 }).resize());
    } else {
      ctx.reply('No channels added. Please add a channel using the /add command.');
    }
  } else {
    ctx.reply('No recent images to post.');
  }
});

bot.command('stats', (ctx) => {
  ctx.reply(`Total images processed: ${processedCount}`);
});

bot.action(/post_(.+)_(\d+)/, async (ctx) => {
  const channel = ctx.match[1];
  const numImages = parseInt(ctx.match[2]);
  for (let i = 0; i < numImages; i++) {
    const image = recentImages[i];
    await ctx.telegram.sendPhoto(`@${channel}`, { source: image.image }, { caption: image.caption });
  }
  recentImages = recentImages.slice(numImages);  // Remove posted images
  ctx.reply(`Images have been posted to @${channel}.`);
});

const app = express();

app.get('/', (req, res) => {
  res.send('Borunning');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  bot.launch();
});
