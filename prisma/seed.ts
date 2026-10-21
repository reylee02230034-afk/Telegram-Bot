import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function encodeGeohash(lat: number, lon: number, precision: number): string {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latRange = [-90.0, 90.0];
  let lonRange = [-180.0, 180.0];
  let isEven = true;
  let bit = 0;
  let ch = 0;
  let hash = '';
  while (hash.length < precision) {
    if (isEven) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (lon >= mid) { ch |= 1 << (4 - bit); lonRange[0] = mid; } else { lonRange[1] = mid; }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) { ch |= 1 << (4 - bit); latRange[0] = mid; } else { latRange[1] = mid; }
    }
    isEven = !isEven;
    if (bit === 4) { hash += base32[ch]; bit = 0; ch = 0; } else { bit++; }
  }
  return hash;
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.report.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.roleSwitchRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.teacherMedia.deleteMany();
  await prisma.teacherProfile.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 已清空旧数据');

  const admin = await prisma.user.upsert({
    where: { telegramId: BigInt('999999999') },
    update: {},
    create: {
      telegramId: BigInt('999999999'),
      username: 'admin',
      firstName: '系统',
      lastName: '管理员',
      role: 'ADMIN',
      hasOnboarded: true,
    },
  });

  const students = [
    { telegramId: 100000001, username: 'alice_student', firstName: '小明', lastName: '同学' },
    { telegramId: 100000002, username: 'bob_student', firstName: '小红', lastName: '同学' },
  ];
  for (const s of students) {
    await prisma.user.create({
      data: {
        telegramId: BigInt(s.telegramId),
        username: s.username,
        firstName: s.firstName,
        lastName: s.lastName,
        role: 'STUDENT',
        hasOnboarded: true,
      },
    });
  }
  console.log(`✅ Admin 1 + Students ${students.length}`);

  type TeacherSeed = {
    telegramId: number;
    username: string;
    firstName: string;
    displayName: string;
    bio: string;
    priceInfo: string;
    homepageUrl?: string;
    lat: number;
    lon: number;
    isOnline: boolean;
  };

  const teachers: TeacherSeed[] = [
    {
      telegramId: 200000001,
      username: 'math_teacher_zhang',
      firstName: '张老师',
      displayName: '张老师 · 初高中数学',
      bio: '10年教龄，重点中学退休名师，擅长压轴题突破和解题思路训练。可上门或线上。',
      priceInfo: '¥200/小时，2小时起约',
      lat: 39.9123,
      lon: 116.4567,
      isOnline: true,
    },
    {
      telegramId: 200000002,
      username: 'english_teacher_li',
      firstName: '李老师',
      displayName: '李老师 · 英语口语',
      bio: '美籍华人，口语陪练12年。雅思/托福口语专项辅导，也可做日常口语。',
      priceInfo: '¥150/小时',
      homepageUrl: 'https://example.com/li-teacher',
      lat: 39.9234,
      lon: 116.4678,
      isOnline: true,
    },
    {
      telegramId: 200000003,
      username: 'piano_teacher_wang',
      firstName: '王老师',
      displayName: '王老师 · 钢琴启蒙',
      bio: '中央音乐学院毕业，儿童钢琴启蒙8年经验。家里有三角钢琴，环境好。',
      priceInfo: '¥180/45分钟',
      lat: 39.9012,
      lon: 116.4456,
      isOnline: false,
    },
    {
      telegramId: 200000004,
      username: 'coding_teacher_chen',
      firstName: '陈老师',
      displayName: '陈老师 · Python编程',
      bio: '大厂资深工程师，少儿Python/Scratch入门，也带大学生算法竞赛。',
      priceInfo: '¥250/小时',
      lat: 39.9345,
      lon: 116.4321,
      isOnline: true,
    },
    {
      telegramId: 200000005,
      username: 'art_teacher_zhao',
      firstName: '赵老师',
      displayName: '赵老师 · 少儿美术',
      bio: '美院毕业，5-12岁创意美术启蒙。家长可旁听。',
      priceInfo: '¥120/次（90分钟）',
      lat: 39.8901,
      lon: 116.4789,
      isOnline: false,
    },
  ];

  for (const t of teachers) {
    const user = await prisma.user.create({
      data: {
        telegramId: BigInt(t.telegramId),
        username: t.username,
        firstName: t.firstName,
        role: 'TEACHER',
        hasOnboarded: true,
        teacherProfile: {
          create: {
            displayName: t.displayName,
            bio: t.bio,
            priceInfo: t.priceInfo,
            homepageUrl: t.homepageUrl,
            latitude: t.lat,
            longitude: t.lon,
            geohash5: encodeGeohash(t.lat, t.lon, 5),
            geohash4: encodeGeohash(t.lat, t.lon, 4),
            isOnline: t.isOnline,
            onlineSince: t.isOnline ? new Date() : null,
            lastLocationAt: new Date(),
            approvalStatus: 'APPROVED',
          },
        },
      },
      include: { teacherProfile: true },
    });
    console.log(`  📚 ${t.displayName} (online=${t.isOnline}, @${t.username})`);
  }

  console.log(`\n🌱 Seed 完成：1 Admin + ${students.length} 学生 + ${teachers.length} 老师`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
