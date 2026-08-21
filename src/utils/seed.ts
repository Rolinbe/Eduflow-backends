import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Début du seeding...');

  // Clean existing data
  await prisma.like.deleteMany();
  await prisma.commentaire.deleteMany();
  await prisma.progression.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.module.deleteMany();
  await prisma.video.deleteMany();
  await prisma.pDF.deleteMany();
  await prisma.cours.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  console.log('🗑️  Données nettoyées');

  const password = await bcrypt.hash('Password123', 12);

  // Create Admin
  const admin = await prisma.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'EdukaFlow',
      email: 'admin@edukaflow.com',
      password,
      role: 'ADMIN',
      status: 'ACTIF',
    },
  });
  console.log('👤 Admin créé:', admin.email);

  // Create Students
  const alex = await prisma.user.create({
    data: {
      firstName: 'Alex',
      lastName: 'Martin',
      email: 'alex@example.com',
      password,
      role: 'APPRENANT',
      status: 'ACTIF',
    },
  });

  const sarah = await prisma.user.create({
    data: {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.j@example.com',
      password,
      role: 'APPRENANT',
      status: 'ACTIF',
    },
  });

  const marc = await prisma.user.create({
    data: {
      firstName: 'Marc',
      lastName: 'Dupont',
      email: 'marc.d@example.com',
      password,
      role: 'APPRENANT',
      status: 'ACTIF',
    },
  });

  console.log('👥 Étudiants créés');

  // Create Categories
  const catWeb = await prisma.category.create({
    data: { name: 'Développement Web', slug: 'developpement-web' },
  });

  const catMobile = await prisma.category.create({
    data: { name: 'Développement Mobile', slug: 'developpement-mobile' },
  });

  const catData = await prisma.category.create({
    data: { name: 'Data Science', slug: 'data-science' },
  });

  const catDesign = await prisma.category.create({
    data: { name: 'Design UI/UX', slug: 'design-ui-ux' },
  });

  const catDevOps = await prisma.category.create({
    data: { name: 'DevOps', slug: 'devops' },
  });

  console.log('📁 Catégories créées');

  // Create Course 1: TypeScript Masterclass
  const cours1 = await prisma.cours.create({
    data: {
      title: 'TypeScript Masterclass',
      description: 'Apprenez TypeScript de zéro à maîtrise. Ce cours couvre les types, les interfaces, les generics, et bien plus.',
      coverImage: null,
      status: 'PUBLIE',
      categoryId: catWeb.id,
      adminId: admin.id,
    },
  });

  // Modules for Course 1
  const mod1_1 = await prisma.module.create({
    data: {
      title: 'Introduction à TypeScript',
      position: 0,
      courseId: cours1.id,
    },
  });

  const mod1_2 = await prisma.module.create({
    data: {
      title: 'Types Avancés',
      position: 1,
      courseId: cours1.id,
    },
  });

  // Lessons for Module 1
  await prisma.lesson.create({
    data: {
      title: 'Qu\'est-ce que TypeScript ?',
      type: 'video',
      videoUrl: null,
      content: 'TypeScript est un langage de programmation open-source qui ajoute des types statiques optionnels à JavaScript.',
      duration: 600,
      position: 0,
      moduleId: mod1_1.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: 'Installation et Configuration',
      type: 'video',
      videoUrl: null,
      content: 'Comment installer TypeScript et configurer votre projet.',
      duration: 450,
      position: 1,
      moduleId: mod1_1.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: 'Votre premier programme TypeScript',
      type: 'video',
      videoUrl: null,
      content: 'Créez votre premier fichier .ts et compilez-le.',
      duration: 300,
      position: 2,
      moduleId: mod1_1.id,
    },
  });

  // Lessons for Module 2
  await prisma.lesson.create({
    data: {
      title: 'Types Unions et Intersection',
      type: 'video',
      videoUrl: null,
      content: 'Comprendre les types unions et les intersections.',
      duration: 720,
      position: 0,
      moduleId: mod1_2.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: 'Les Generics',
      type: 'video',
      videoUrl: null,
      content: 'Les generics permettent de créer des composants réutilisables.',
      duration: 900,
      position: 1,
      moduleId: mod1_2.id,
    },
  });

  // Videos for Course 1
  await prisma.video.create({
    data: {
      title: 'Introduction à TypeScript',
      description: 'Découvrez TypeScript et ses avantages',
      url: 'videos/intro-typescript.mp4',
      duration: 600,
      position: 0,
      isRequired: true,
      courseId: cours1.id,
    },
  });

  await prisma.video.create({
    data: {
      title: 'Types et Interfaces',
      description: 'Les bases des types en TypeScript',
      url: 'videos/types-interfaces.mp4',
      duration: 800,
      position: 1,
      isRequired: true,
      courseId: cours1.id,
    },
  });

  // PDFs for Course 1
  await prisma.pDF.create({
    data: {
      title: 'Cheat Sheet TypeScript',
      description: 'Référence rapide des types TypeScript',
      url: 'pdfs/cheat-sheet-typescript.pdf',
      pageCount: 5,
      position: 0,
      courseId: cours1.id,
    },
  });

  // Create Course 2: React pour débutants
  const cours2 = await prisma.cours.create({
    data: {
      title: 'React pour Débutants',
      description: 'Apprenez React de zéro avec des projets pratiques.',
      status: 'PUBLIE',
      categoryId: catWeb.id,
      adminId: admin.id,
    },
  });

  const mod2_1 = await prisma.module.create({
    data: {
      title: 'Bases de React',
      position: 0,
      courseId: cours2.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: 'Introduction à React',
      type: 'video',
      videoUrl: null,
      content: 'React est une bibliothèque JavaScript pour créer des interfaces utilisateur.',
      duration: 500,
      position: 0,
      moduleId: mod2_1.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: 'Les Composants',
      type: 'video',
      videoUrl: null,
      content: 'Les composants sont les briques de base d\'une application React.',
      duration: 600,
      position: 1,
      moduleId: mod2_1.id,
    },
  });

  await prisma.video.create({
    data: {
      title: 'Introduction à React',
      description: 'Premiers pas avec React',
      url: 'videos/intro-react.mp4',
      duration: 500,
      position: 0,
      isRequired: true,
      courseId: cours2.id,
    },
  });

  await prisma.pDF.create({
    data: {
      title: 'Guide React',
      description: 'Le guide complet pour débuter avec React',
      url: 'pdfs/guide-react.pdf',
      pageCount: 20,
      position: 0,
      courseId: cours2.id,
    },
  });

  // Create Course 3: Python pour Data Science
  const cours3 = await prisma.cours.create({
    data: {
      title: 'Python pour Data Science',
      description: 'Maîtrisez Python et ses bibliothèques pour l\'analyse de données.',
      status: 'PUBLIE',
      categoryId: catData.id,
      adminId: admin.id,
    },
  });

  const mod3_1 = await prisma.module.create({
    data: {
      title: 'Python Fondamentaux',
      position: 0,
      courseId: cours3.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: 'Variables et Types de Données',
      type: 'video',
      videoUrl: null,
      content: 'Les bases de Python: variables, strings, nombres.',
      duration: 400,
      position: 0,
      moduleId: mod3_1.id,
    },
  });

  await prisma.video.create({
    data: {
      title: 'Variables Python',
      description: 'Découvrez les variables en Python',
      url: 'videos/python-variables.mp4',
      duration: 400,
      position: 0,
      isRequired: true,
      courseId: cours3.id,
    },
  });

  // Course 4: Design UI/UX (BROUILLON)
  await prisma.cours.create({
    data: {
      title: 'Design UI/UX Complet',
      description: 'Apprenez les principes du design et créez des interfaces magnifiques.',
      status: 'BROUILLON',
      categoryId: catDesign.id,
      adminId: admin.id,
    },
  });

  // Course 5: DevOps (PUBLIE)
  const cours5 = await prisma.cours.create({
    data: {
      title: 'Introduction au DevOps',
      description: 'Les fondamentaux du DevOps: CI/CD, Docker, Kubernetes.',
      status: 'PUBLIE',
      categoryId: catDevOps.id,
      adminId: admin.id,
    },
  });

  const mod5_1 = await prisma.module.create({
    data: {
      title: 'Docker Fundamentals',
      position: 0,
      courseId: cours5.id,
    },
  });

  await prisma.lesson.create({
    data: {
      title: 'Qu\'est-ce que Docker ?',
      type: 'video',
      videoUrl: null,
      content: 'Docker est une plateforme de conteneurisation.',
      duration: 450,
      position: 0,
      moduleId: mod5_1.id,
    },
  });

  await prisma.video.create({
    data: {
      title: 'Docker pour débutants',
      description: 'Introduction à Docker',
      url: 'videos/docker-intro.mp4',
      duration: 450,
      position: 0,
      isRequired: true,
      courseId: cours5.id,
    },
  });

  console.log('📚 Cours créés');

  // Enrollments
  await prisma.enrollment.create({
    data: { userId: alex.id, courseId: cours1.id, progress: 40 },
  });

  await prisma.enrollment.create({
    data: { userId: alex.id, courseId: cours2.id, progress: 80 },
  });

  await prisma.enrollment.create({
    data: { userId: sarah.id, courseId: cours1.id, progress: 100 },
  });

  await prisma.enrollment.create({
    data: { userId: sarah.id, courseId: cours3.id, progress: 60 },
  });

  await prisma.enrollment.create({
    data: { userId: marc.id, courseId: cours1.id, progress: 20 },
  });

  await prisma.enrollment.create({
    data: { userId: marc.id, courseId: cours5.id, progress: 90 },
  });

  console.log('📝 Inscriptions créées');

  // Certificates (for Sarah who completed TypeScript)
  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId: cours1.id } },
  });

  for (const lesson of lessons) {
    await prisma.progression.create({
      data: {
        userId: sarah.id,
        coursId: cours1.id,
        lessonId: lesson.id,
        status: 'TERMINE',
        timeSpent: lesson.duration,
        position: lesson.duration,
        lastAccessed: new Date(),
      },
    });
  }

  await prisma.certificate.create({
    data: {
      userId: sarah.id,
      coursId: cours1.id,
      uniqueNumber: `EDU-${Date.now()}-SARAH`,
      verificationKey: crypto.randomBytes(32).toString('hex'),
      status: 'VALIDE',
    },
  });

  console.log('🎓 Certificats créés');

  // Notifications
  await prisma.notification.create({
    data: {
      userId: alex.id,
      type: 'SUCCES',
      title: 'Bienvenue',
      message: 'Bienvenue sur EdukaFlow ! Commencez à apprendre.',
    },
  });

  await prisma.notification.create({
    data: {
      userId: sarah.id,
      type: 'CERTIFICAT',
      title: 'Certificat obtenu',
      message: 'Félicitations ! Vous avez obtenu le certificat TypeScript Masterclass.',
    },
  });

  await prisma.notification.create({
    data: {
      userId: marc.id,
      type: 'INFO',
      title: 'Nouveau cours disponible',
      message: 'Le cours "Introduction au DevOps" est maintenant disponible.',
    },
  });

  console.log('🔔 Notifications créées');

  // Comments
  const comment1 = await prisma.commentaire.create({
    data: {
      content: 'Excellent cours ! Les explications sont très claires.',
      userId: alex.id,
      coursId: cours1.id,
    },
  });

  await prisma.commentaire.create({
    data: {
      content: 'Merci beaucoup Alex ! Content que le cours vous plaise.',
      userId: admin.id,
      coursId: cours1.id,
      parentId: comment1.id,
    },
  });

  await prisma.commentaire.create({
    data: {
      content: 'Est-ce qu\'il y aura une suite sur les types avancés ?',
      userId: sarah.id,
      coursId: cours1.id,
    },
  });

  await prisma.like.create({
    data: {
      userId: alex.id,
      commentaireId: comment1.id,
    },
  });

  await prisma.like.create({
    data: {
      userId: sarah.id,
      commentaireId: comment1.id,
    },
  });

  console.log('💬 Commentaires créés');

  // Audit logs
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'SEED_COMPLETE',
      details: 'Base de données initialisée avec les données de test',
    },
  });

  console.log('');
  console.log('✅ Seeding terminé avec succès !');
  console.log('');
  console.log('👤 Comptes créés:');
  console.log('   Admin:     admin@edukaflow.com / Password123');
  console.log('   Student 1: alex@example.com / Password123');
  console.log('   Student 2: sarah.j@example.com / Password123');
  console.log('   Student 3: marc.d@example.com / Password123');
  console.log('');
  console.log('📚 Cours créés: 5');
  console.log('📁 Catégories: 5');
  console.log('🎓 Certificats: 1');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
