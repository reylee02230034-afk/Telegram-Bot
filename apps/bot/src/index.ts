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
  | 'teacher_age'
  | 'teacher_hometown'
  | 'teacher_height'
  | 'teacher_weight'
  | 'teacher_bust'
  | 'teacher_services'
  | 'teacher_price_single'
  | 'teacher_price_double'
  | 'teacher_price_overnight'
  | 'teacher_price_other'
  | 'teacher_homepage'
  | 'teacher_location'
  | 'done';

interface BotSession {
  step: OnboardStep;
  role?: BotRole;
  tempTeacher?: {
    displayName?: string;
    age?: number;
    hometown?: string;
    heightCm?: number;
    weightKg?: number;
    bust?: string;
    subjects?: string;
    priceSingle?: string;
    priceDouble?: string;
    priceOvernight?: string;
    priceOther?: string;
    bio?: string;
    homepageUrl?: string;
    latitude?: number;
    longitude?: number;
    mediaFileIds?: string[];
  };
}

type MyContext = Context & SessionFlavor<BotSession>;

// Telegram 会复用同一个 Mini App WebView，加时间戳强制重新加载页面，避免切换身份后仍显示旧角色
function pageUrl(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${MINI_APP_URL}${path}${sep}_v=${Date.now()}`;
}

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
        .webApp('🗺️ 进入地图', pageUrl('/maps'))
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
    await askSwitchConfirm(ctx, user.role as BotRole);
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

  bot.callbackQuery('switch_role', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(ctx.from!.id) },
    });
    if (!user) return await ctx.reply('请先发送 /start');
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return await ctx.reply('管理员无法切换身份');
    }
    await askSwitchConfirm(ctx, user.role as BotRole);
  });

  bot.callbackQuery('switch_cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('已取消切换。发送 /start 可查看当前身份。');
  });

  bot.callbackQuery('switch_to_teacher', async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramId = BigInt(ctx.from!.id);
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { teacherProfile: true },
    });
    if (!user) return await ctx.reply('请先发送 /start');
    if (user.role === 'TEACHER') return await ctx.reply('您当前已经是老师身份。');

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'TEACHER', hasOnboarded: !!user.teacherProfile },
    });
    await prisma.studentPresence.deleteMany({ where: { userId: user.id } });

    ctx.session = { step: 'awaiting_role', role: 'TEACHER' };
    await ctx.reply('🔄 已切换为老师身份。');
    if (!user.teacherProfile) {
      return await startTeacherOnboarding(ctx, updated);
    }
    return await openTeacherMap(ctx, { ...updated, teacherProfile: user.teacherProfile });
  });

  bot.callbackQuery('switch_to_student', async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramId = BigInt(ctx.from!.id);
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { teacherProfile: true },
    });
    if (!user) return await ctx.reply('请先发送 /start');
    if (user.role === 'STUDENT') return await ctx.reply('您当前已经是学生身份。');

    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'STUDENT', hasOnboarded: true },
    });
    if (user.teacherProfile) {
      await prisma.teacherProfile.update({
        where: { id: user.teacherProfile.id },
        data: { isOnline: false, onlineSince: null },
      });
    }

    ctx.session = { step: 'done', role: 'STUDENT' };
    await ctx.reply('🔄 已切换为学生身份。');
    return await openStudentMap(ctx);
  });

  bot.callbackQuery('skip_media', async (ctx) => {
    ctx.session.step = 'teacher_age';
    await ctx.answerCallbackQuery();
    await ctx.reply('👤 简介 1/6：请输入年龄（岁）。可发送 - 跳过');
  });

  bot.callbackQuery('skip_homepage', async (ctx) => {
    ctx.session.step = 'teacher_location';
    await ctx.answerCallbackQuery();
    await askLocation(ctx);
  });

  bot.callbackQuery('finish_media', async (ctx) => {
    ctx.session.step = 'teacher_age';
    await ctx.answerCallbackQuery();
    await ctx.reply('👤 简介 1/6：请输入年龄（岁）。可发送 - 跳过');
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

      case 'teacher_age': {
        if (text !== '-') {
          const n = parseInt(text, 10);
          if (!Number.isFinite(n) || n < 1 || n > 99) {
            return await ctx.reply('请输入有效年龄（1-99 的数字），或发送 - 跳过');
          }
          ctx.session.tempTeacher!.age = n;
        }
        ctx.session.step = 'teacher_hometown';
        return await ctx.reply('👤 简介 2/6：哪里人？可发送 - 跳过');
      }

      case 'teacher_hometown': {
        if (text !== '-') ctx.session.tempTeacher!.hometown = text.slice(0, 60);
        ctx.session.step = 'teacher_height';
        return await ctx.reply('👤 简介 3/6：身高（cm）？可发送 - 跳过');
      }

      case 'teacher_height': {
        if (text !== '-') {
          const n = parseInt(text, 10);
          if (!Number.isFinite(n) || n < 100 || n > 250) {
            return await ctx.reply('请输入有效身高（100-250 的数字），或发送 - 跳过');
          }
          ctx.session.tempTeacher!.heightCm = n;
        }
        ctx.session.step = 'teacher_weight';
        return await ctx.reply('👤 简介 4/6：体重（kg）？可发送 - 跳过');
      }

      case 'teacher_weight': {
        if (text !== '-') {
          const n = parseFloat(text);
          if (!Number.isFinite(n) || n < 30 || n > 200) {
            return await ctx.reply('请输入有效体重（30-200 的数字），或发送 - 跳过');
          }
          ctx.session.tempTeacher!.weightKg = n;
        }
        ctx.session.step = 'teacher_bust';
        return await ctx.reply('👤 简介 5/6：胸围？可发送 - 跳过');
      }

      case 'teacher_bust': {
        if (text !== '-') ctx.session.tempTeacher!.bust = text.slice(0, 20);
        ctx.session.step = 'teacher_services';
        return await ctx.reply('👤 简介 6/6：服务项目（可多项，用、分隔）。可发送 - 跳过');
      }

      case 'teacher_services': {
        if (text !== '-') ctx.session.tempTeacher!.subjects = text.slice(0, 200);
        ctx.session.step = 'teacher_price_single';
        return await ctx.reply('💰 价格 1/4：一课价格（如 300元）。可发送 - 跳过');
      }

      case 'teacher_price_single': {
        if (text !== '-') ctx.session.tempTeacher!.priceSingle = text.slice(0, 60);
        ctx.session.step = 'teacher_price_double';
        return await ctx.reply('💰 价格 2/4：两课价格？可发送 - 跳过');
      }

      case 'teacher_price_double': {
        if (text !== '-') ctx.session.tempTeacher!.priceDouble = text.slice(0, 60);
        ctx.session.step = 'teacher_price_overnight';
        return await ctx.reply('💰 价格 3/4：包夜价格？可发送 - 跳过');
      }

      case 'teacher_price_overnight': {
        if (text !== '-') ctx.session.tempTeacher!.priceOvernight = text.slice(0, 60);
        ctx.session.step = 'teacher_price_other';
        return await ctx.reply('💰 价格 4/4：其它价格（如包月、路远加价）。可发送 - 跳过');
      }

      case 'teacher_price_other': {
        if (text !== '-') ctx.session.tempTeacher!.priceOther = text.slice(0, 100);
        ctx.session.step = 'teacher_homepage';
        return await ctx.reply('🔗 请输入您的个人主页链接（可选）：', {
          reply_markup: new InlineKeyboard().text('跳过主页', 'skip_homepage'),
        });
      }

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
          '请按引导操作，或发送 /start 重新开始。\n\n📌 常用命令：\n/start - 主菜单\n/switchrole - 切换身份'
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

async function askSwitchConfirm(ctx: MyContext, current: BotRole) {
  const target: BotRole = current === 'STUDENT' ? 'TEACHER' : 'STUDENT';
  const kb = new InlineKeyboard()
    .text(
      target === 'TEACHER' ? '✅ 切换为老师' : '✅ 切换为学生',
      target === 'TEACHER' ? 'switch_to_teacher' : 'switch_to_student'
    )
    .row()
    .text('取消', 'switch_cancel');

  await ctx.reply(
    `当前身份：${current === 'STUDENT' ? '🎓 学生' : '👨‍🏫 老师'}\n\n确定切换为${
      target === 'TEACHER' ? '👨‍🏫 老师' : '🎓 学生'
    }吗？\n\n${
      target === 'TEACHER'
        ? '切换后需要完善老师资料（照片 / 简介 / 价格 / 位置）。'
        : '您已有的老师资料会保留并自动下线，下次切回老师无需重新填写。'
    }`,
    { reply_markup: kb }
  );
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

function composeBio(t: NonNullable<BotSession['tempTeacher']>): string | null {
  const parts: string[] = [];
  if (t.age) parts.push(`${t.age}岁`);
  if (t.hometown) parts.push(t.hometown);
  if (t.heightCm) parts.push(`${t.heightCm}cm`);
  if (t.weightKg) parts.push(`${t.weightKg}kg`);
  if (t.bust) parts.push(`胸围 ${t.bust}`);
  if (t.subjects) parts.push(`服务：${t.subjects}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function composePriceInfo(t: NonNullable<BotSession['tempTeacher']>): string | null {
  const lines: string[] = [];
  if (t.priceSingle) lines.push(`一课 ${t.priceSingle}`);
  if (t.priceDouble) lines.push(`两课 ${t.priceDouble}`);
  if (t.priceOvernight) lines.push(`包夜 ${t.priceOvernight}`);
  if (t.priceOther) lines.push(`其它 ${t.priceOther}`);
  return lines.length > 0 ? lines.join('\n') : null;
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

  const bio = composeBio(t);
  const priceInfo = composePriceInfo(t);

  const profileData = {
    displayName,
    bio,
    age: t.age ?? null,
    hometown: t.hometown ?? null,
    heightCm: t.heightCm ?? null,
    weightKg: t.weightKg ?? null,
    bust: t.bust ?? null,
    subjects: t.subjects ?? null,
    priceInfo,
    homepageUrl: t.homepageUrl || null,
    latitude: t.latitude!,
    longitude: t.longitude!,
    geohash5: encodeGeohash(t.latitude!, t.longitude!, 5),
    geohash4: encodeGeohash(t.latitude!, t.longitude!, 4),
    lastLocationAt: new Date(),
    approvalStatus: 'APPROVED' as const,
  };

  if (teacherProfile) {
    teacherProfile = await prisma.teacherProfile.update({
      where: { id: teacherProfile.id },
      data: profileData,
    });
  } else {
    teacherProfile = await prisma.teacherProfile.create({
      data: {
        userId: user.id,
        ...profileData,
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
    `🎉 老师资料已创建完成！\n\n👤 称呼：${displayName}\n💰 价格：${priceInfo || '未设置'}\n📍 位置已记录\n\n现在让我们打开地图吧！`
  );

  await openTeacherMap(ctx, { ...user, teacherProfile });
}

async function openTeacherMap(ctx: MyContext, user: any) {
  const teacherId = user.teacherProfile?.id;

  if (teacherId) {
    const isOnline = user.teacherProfile?.isOnline;
    const toggleKb = new InlineKeyboard()
      .webApp(isOnline ? '⏸️ 下课（休息）' : '▶️ 上课（开始接单）', pageUrl('/maps'))
      .row()
      .webApp('✏️ 编辑资料', pageUrl('/teacher/edit'))
      .row()
      .text('🔄 切换身份', 'switch_role');
    return await ctx.reply(
      `👨‍🏫 ${user.firstName || '老师'}，当前状态：${isOnline ? '🟢 上课中' : '🔴 休息中'}\n\n${isOnline ? '学生可以在地图上看到您。' : '点击下方"上课"按钮开始接单。'}`,
      { reply_markup: toggleKb }
    );
  }

  const kb = new InlineKeyboard()
    .webApp('🗺️ 打开地图', pageUrl('/maps'))
    .row()
    .text('🔄 切换身份', 'switch_role');
  await ctx.reply(
    '🗺️ 进入地图可以：\n• 查看自己的位置\n• 切换上课/下课模式\n• 编辑资料和媒体',
    { reply_markup: kb }
  );
}

async function openStudentMap(ctx: MyContext) {
  const firstName = ctx.from?.first_name || '同学';
  const kb = new InlineKeyboard()
    .webApp('🗺️ 打开地图找老师', pageUrl('/maps'))
    .row()
    .text('🔄 切换身份', 'switch_role');
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
