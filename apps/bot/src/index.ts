import { Bot, InlineKeyboard, Keyboard, session } from 'grammy';
import type { Context, SessionFlavor } from 'grammy';
import dotenv from 'dotenv';
import prisma from './lib/prisma';
import { encodeGeohash } from './lib/geo';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('[Bot] TELEGRAM_BOT_TOKEN 未配置');
  process.exit(1);
}

const MINI_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://t.me/your_bot';
const TELEGRAM_API = `https://api.telegram.org/bot${token}`;

type BotRole = 'TEACHER' | 'STUDENT';

type OnboardStep =
  | 'awaiting_role'
  | 'teacher_media'
  | 'teacher_bio'
  | 'teacher_price'
  | 'teacher_homepage'
  | 'teacher_location'
  | 'done';

interface BotSession {
  step: OnboardStep;
  role?: BotRole;
  tempTeacher?: {
    displayName?: string;
    bio?: string;
    priceInfo?: string;
    homepageUrl?: string;
    latitude?: number;
    longitude?: number;
    mediaFileIds?: string[];
  };
}

type MyContext = Context & SessionFlavor<BotSession>;

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const json = await res.json();
    if (!json.ok || !json.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
  } catch (err) {
    console.error('[Bot] getFile failed:', err);
    return null;
  }
}

function makeBot(): Bot<MyContext> {
  const bot = new Bot<MyContext>(token as string);

  bot.use(
    session({
      initial: (): BotSession => ({ step: 'awaiting_role' }),
      getSessionKey: (ctx) =>
        ctx.from?.id !== undefined ? `telegram:${ctx.from.id}` : undefined,
    })
  );

  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id);
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { teacherProfile: true },
    });

    if (!user) {
      ctx.session = { step: 'awaiting_role' };
      return await askRole(ctx);
    }

    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      const kb = new InlineKeyboard()
        .webApp('🗺️ 进入地图', `${MINI_APP_URL}/maps`)
        .row();
      return await ctx.reply(
        `👋 欢迎回来，管理员 ${user.firstName || ''}！\n\n您可以直接进入地图，或通过数据库管理用户和申请。`,
        { reply_markup: kb }
      );
    }

    if (!user.hasOnboarded || (user.role === 'TEACHER' && !user.teacherProfile)) {
      ctx.session = { step: 'awaiting_role', role: user.role as BotRole };
      if (user.role === 'TEACHER' && !user.teacherProfile) {
        return await startTeacherOnboarding(ctx, user);
      }
      return await askRole(ctx);
    }

    if (user.role === 'TEACHER') {
      return await openTeacherMap(ctx, user);
    }
    return await openStudentMap(ctx);
  });

  bot.command('switchrole', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return await ctx.reply('请先发送 /start');
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return await ctx.reply('管理员无法切换身份');
    }

    const pending = await prisma.roleSwitchRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    });
    if (pending) {
      return await ctx.reply('⏳ 您已有待审核的身份切换申请，请耐心等待管理员处理。');
    }

    const target = user.role === 'STUDENT' ? 'TEACHER' : 'STUDENT';
    const request = await prisma.roleSwitchRequest.create({
      data: { userId: user.id, requestedRole: target },
    });
    await ctx.reply(
      `📝 身份切换申请已提交！\n\n当前身份：${user.role === 'STUDENT' ? '🎓 学生' : '👨‍🏫 老师'}\n申请身份：${target === 'STUDENT' ? '🎓 学生' : '👨‍🏫 老师'}\n申请 ID：${request.id}\n\n审核通过后将自动切换。`
    );
  });

  bot.callbackQuery('role_teacher', async (ctx) => {
    ctx.session.role = 'TEACHER';
    ctx.session.tempTeacher = {};
    const telegramId = BigInt(ctx.from!.id);
    const username = ctx.from!.username;
    const firstName = ctx.from!.first_name;

    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          username,
          firstName,
          role: 'TEACHER',
          hasOnboarded: false,
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'TEACHER', hasOnboarded: false, username, firstName },
      });
    }

    ctx.session.step = 'teacher_media';
    await ctx.answerCallbackQuery();
    await startTeacherOnboarding(ctx, user);
  });

  bot.callbackQuery('role_student', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id);
    const username = ctx.from!.username;
    const firstName = ctx.from!.first_name;

    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          username,
          firstName,
          role: 'STUDENT',
          hasOnboarded: true,
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'STUDENT', hasOnboarded: true, username, firstName },
      });
    }

    ctx.session = { step: 'done', role: 'STUDENT' };
    await ctx.answerCallbackQuery();
    await openStudentMap(ctx);
  });

  bot.callbackQuery('skip_media', async (ctx) => {
    ctx.session.step = 'teacher_bio';
    await ctx.answerCallbackQuery();
    await ctx.reply('📝 请输入您的简介（学生将看到），或点击"跳过简介"：', {
      reply_markup: new InlineKeyboard().text('跳过简介', 'skip_bio'),
    });
  });

  bot.callbackQuery('skip_bio', async (ctx) => {
    ctx.session.step = 'teacher_price';
    await ctx.answerCallbackQuery();
    await ctx.reply('💰 请输入您的价格信息（如：100元/小时）：');
  });

  bot.callbackQuery('skip_homepage', async (ctx) => {
    ctx.session.step = 'teacher_location';
    await ctx.answerCallbackQuery();
    await askLocation(ctx);
  });

  bot.callbackQuery('finish_media', async (ctx) => {
    ctx.session.step = 'teacher_bio';
    await ctx.answerCallbackQuery();
    await ctx.reply('📝 请输入您的简介，或点击"跳过简介"：', {
      reply_markup: new InlineKeyboard().text('跳过简介', 'skip_bio'),
    });
  });

  bot.on(':location', async (ctx) => {
    const loc = ctx.message?.location;
    if (!loc) return;

    if (ctx.session.step === 'teacher_location') {
      ctx.session.tempTeacher = {
        ...ctx.session.tempTeacher,
        latitude: loc.latitude,
        longitude: loc.longitude,
      };
      await ctx.reply('✅ 位置已获取！正在为您创建老师资料...');
      await finalizeTeacherOnboarding(ctx);
      return;
    }

    if (ctx.session.role === 'TEACHER') {
      await ctx.reply('请按引导顺序完成，或发送 /start 重新开始。');
      return;
    }

    await ctx.reply('请发送 /start 开始使用。');
  });

  bot.on(':photo', async (ctx) => {
    if (ctx.session.step !== 'teacher_media') return;
    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) return;
    const fileId = photos[photos.length - 1].file_id;
    ctx.session.tempTeacher!.mediaFileIds = [
      ...(ctx.session.tempTeacher!.mediaFileIds || []),
      fileId,
    ];
    await ctx.reply(
      `📸 已接收 ${ctx.session.tempTeacher!.mediaFileIds!.length} 张照片。可继续发送，或点击"完成"：`,
      {
        reply_markup: new InlineKeyboard()
          .text('继续发送', 'noop')
          .text('完成', 'finish_media'),
      }
    );
  });

  bot.on(':video', async (ctx) => {
    if (ctx.session.step !== 'teacher_media') return;
    const video = ctx.message?.video;
    if (!video) return;
    ctx.session.tempTeacher!.mediaFileIds = [
      ...(ctx.session.tempTeacher!.mediaFileIds || []),
      video.file_id,
    ];
    await ctx.reply(
      `🎬 已接收 ${ctx.session.tempTeacher!.mediaFileIds!.length} 个媒体文件。可继续发送，或点击"完成"：`,
      {
        reply_markup: new InlineKeyboard()
          .text('继续发送', 'noop')
          .text('完成', 'finish_media'),
      }
    );
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) return;
    if (text.startsWith('/')) return;

    switch (ctx.session.step) {
      case 'awaiting_role':
        return await askRole(ctx);

      case 'teacher_bio':
        ctx.session.tempTeacher!.bio = text;
        ctx.session.step = 'teacher_price';
        return await ctx.reply('💰 请输入您的价格信息（如：100元/小时）：');

      case 'teacher_price':
        ctx.session.tempTeacher!.priceInfo = text;
        ctx.session.step = 'teacher_homepage';
        return await ctx.reply('🔗 请输入您的主页 URL（可选）：', {
          reply_markup: new InlineKeyboard().text('跳过主页', 'skip_homepage'),
        });

      case 'teacher_homepage':
        if (!/^https?:\/\//i.test(text)) {
          return await ctx.reply('URL 无效，请输入以 http:// 或 https:// 开头的链接，或点击"跳过主页"：', {
            reply_markup: new InlineKeyboard().text('跳过主页', 'skip_homepage'),
          });
        }
        ctx.session.tempTeacher!.homepageUrl = text;
        ctx.session.step = 'teacher_location';
        return await askLocation(ctx);

      default:
        return await ctx.reply(
          '请按引导操作，或发送 /start 重新开始。\n\n📌 常用命令：\n/start - 主菜单\n/switchrole - 申请切换身份'
        );
    }
  });

  bot.command('cancel', async (ctx) => {
    ctx.session = { step: 'awaiting_role' };
    await ctx.reply('已取消当前操作。发送 /start 重新开始。');
  });

  bot.on('callback_query:data', async (ctx) => {
    if (ctx.callbackQuery.data === 'noop') await ctx.answerCallbackQuery();
  });

  bot.on('message', async (ctx) => {
    if (ctx.session.step === 'awaiting_role') {
      return await askRole(ctx);
    }
    await ctx.reply('请发送 /start 开始使用。');
  });

  return bot;
}

async function askRole(ctx: MyContext) {
  const kb = new InlineKeyboard()
    .text('👨‍🏫 我是老师', 'role_teacher')
    .text('🎓 我是学生', 'role_student');
  await ctx.reply('👋 欢迎来到约课机器人！\n\n请选择您的身份：', { reply_markup: kb });
}

async function startTeacherOnboarding(ctx: MyContext, user: any) {
  ctx.session.step = 'teacher_media';
  const kb = new InlineKeyboard()
    .text('📷 开始上传照片/视频', 'noop')
    .row()
    .text('跳过上传 →', 'skip_media');
  await ctx.reply(
    `👨‍🏫 欢迎，${user.firstName || '老师'}！\n\n📸 您可以上传照片或视频展示自己（可选，数量不限），完成后点击下方"跳过上传"继续设置简介和价格，或直接发送媒体文件：`,
    { reply_markup: kb }
  );
}

async function askLocation(ctx: MyContext) {
  const kb = new Keyboard().requestLocation('📍 发送我的位置').resized();
  await ctx.reply(
    '📍 最后一步：请发送您的位置。\n\n这将决定您在学生地图上的显示位置。您每次切换到"上课"模式时会自动更新位置。',
    { reply_markup: kb }
  );
}

async function finalizeTeacherOnboarding(ctx: MyContext) {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return await ctx.reply('用户不存在，请重新 /start');

  const t = ctx.session.tempTeacher!;

  const displayName =
    (user.firstName && user.firstName.trim()) ||
    `老师_${user.telegramId.toString().slice(-6)}`;

  let teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: user.id } });

  if (teacherProfile) {
    teacherProfile = await prisma.teacherProfile.update({
      where: { id: teacherProfile.id },
      data: {
        displayName,
        bio: t.bio || null,
        priceInfo: t.priceInfo || null,
        homepageUrl: t.homepageUrl || null,
        latitude: t.latitude!,
        longitude: t.longitude!,
        geohash5: encodeGeohash(t.latitude!, t.longitude!, 5),
        geohash4: encodeGeohash(t.latitude!, t.longitude!, 4),
        lastLocationAt: new Date(),
        approvalStatus: 'APPROVED',
      },
    });
  } else {
    teacherProfile = await prisma.teacherProfile.create({
      data: {
        userId: user.id,
        displayName,
        bio: t.bio || null,
        priceInfo: t.priceInfo || null,
        homepageUrl: t.homepageUrl || null,
        latitude: t.latitude!,
        longitude: t.longitude!,
        geohash5: encodeGeohash(t.latitude!, t.longitude!, 5),
        geohash4: encodeGeohash(t.latitude!, t.longitude!, 4),
        lastLocationAt: new Date(),
        approvalStatus: 'APPROVED',
      },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'TEACHER', hasOnboarded: true },
  });

  if (t.mediaFileIds && t.mediaFileIds.length > 0) {
    await ctx.reply(`⏳ 正在处理 ${t.mediaFileIds.length} 个媒体文件...`);
    for (let i = 0; i < t.mediaFileIds.length; i++) {
      const fileId = t.mediaFileIds[i];
      const url = await getTelegramFileUrl(fileId);
      if (!url) continue;

      let mimeType = 'image/jpeg';
      let mediaType: 'IMAGE' | 'VIDEO' = 'IMAGE';
      if (fileId && fileId.length > 32) {
        mediaType = 'VIDEO';
        mimeType = 'video/mp4';
      }

      try {
        await prisma.teacherMedia.create({
          data: {
            teacherId: teacherProfile!.id,
            type: mediaType,
            url,
            fileSizeBytes: BigInt(0),
            mime: mimeType,
            sortOrder: i,
            moderationStatus: 'APPROVED',
          },
        });
      } catch (e) {
        console.error('[Bot] TeacherMedia create failed:', e);
      }
    }
    await ctx.reply('✅ 媒体文件已保存！');
  }

  ctx.session = { step: 'done', role: 'TEACHER' };

  await ctx.reply(
    `🎉 老师资料已创建完成！\n\n👤 称呼：${displayName}\n💰 价格：${t.priceInfo || '未设置'}\n📍 位置已记录\n\n现在让我们打开地图吧！`
  );

  await openTeacherMap(ctx, { ...user, teacherProfile });
}

async function openTeacherMap(ctx: MyContext, user: any) {
  const teacherId = user.teacherProfile?.id;

  if (teacherId) {
    const isOnline = user.teacherProfile?.isOnline;
    const toggleKb = new InlineKeyboard()
      .webApp(isOnline ? '⏸️ 下课（休息）' : '▶️ 上课（开始接单）', `${MINI_APP_URL}/maps`)
      .row()
      .webApp('✏️ 编辑资料', `${MINI_APP_URL}/teacher/edit`);
    return await ctx.reply(
      `👨‍🏫 ${user.firstName || '老师'}，当前状态：${isOnline ? '🟢 上课中' : '🔴 休息中'}\n\n${isOnline ? '学生可以在地图上看到您。' : '点击下方"上课"按钮开始接单。'}`,
      { reply_markup: toggleKb }
    );
  }

  const kb = new InlineKeyboard()
    .webApp('🗺️ 打开地图', `${MINI_APP_URL}/maps`);
  await ctx.reply(
    '🗺️ 进入地图可以：\n• 查看自己的位置\n• 切换上课/下课模式\n• 编辑资料和媒体',
    { reply_markup: kb }
  );
}

async function openStudentMap(ctx: MyContext) {
  const firstName = ctx.from?.first_name || '同学';
  const kb = new InlineKeyboard()
    .webApp('🗺️ 打开地图找老师', `${MINI_APP_URL}/maps`);
  await ctx.reply(
    `🎓 欢迎回来，${firstName}！\n\n点击下方打开地图，查看附近在线的老师。`,
    { reply_markup: kb }
  );
}

const bot = makeBot();

bot.catch((err) => {
  console.error('[Bot Error]', err);
});

async function start() {
  console.log('[Bot] 启动中...');
  await bot.start({
    onStart: () => console.log('[Bot] ✅ 已连接'),
  });
}

start().catch(console.error);
