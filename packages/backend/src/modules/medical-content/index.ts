import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';

const ICD10_ARABIC: Record<string, { name_ar: string; description_ar: string; category_ar: string }> = {
  'R51.9': { name_ar: 'صداع', description_ar: 'اضطراب صداع أولي', category_ar: 'الأعراض والعلامات' },
  'R50.9': { name_ar: 'حمى', description_ar: 'ارتفاع غير محدد في درجة الحرارة', category_ar: 'الأعراض والعلامات' },
  'R05.9': { name_ar: 'سعال', description_ar: 'سعال غير محدد', category_ar: 'أمراض الجهاز التنفسي' },
  'R07.9': { name_ar: 'ألم الصدر', description_ar: 'ألم في الصدر غير محدد', category_ar: 'أمراض القلب والأوعية الدموية' },
  'R10.9': { name_ar: 'ألم البطن', description_ar: 'ألم في البطن غير محدد', category_ar: 'أمراض الجهاز الهضمي' },
  'R06.02': { name_ar: 'ضيق التنفس', description_ar: 'difficulty في التنفس', category_ar: 'أمراض الجهاز التنفسي' },
  'R11.2': { name_ar: 'غثيان مع قيء', description_ar: 'غثيان مع قيء', category_ar: 'أمراض الجهاز الهضمي' },
  'R42': { name_ar: 'دوار', description_ar: 'دوار وذهان', category_ar: 'أمراض الجهاز العصبي' },
  'R53.1': { name_ar: 'ضعف', description_ar: 'ضعف وجوع', category_ar: 'الأعراض والعلامات' },
  'M54.5': { name_ar: 'ألم أسفل الظهر', description_ar: 'ألم في أسفل الظهر', category_ar: 'أمراض العظام والمفاصل' },
  'J02.9': { name_ar: 'التهاب الحلق', description_ar: 'التهاب الحلق الحاد غير المحدد', category_ar: 'أمراض الجهاز التنفسي' },
  'M25.5': { name_ar: 'ألم المفاصل', description_ar: 'ألم في المفصل', category_ar: 'أمراض العظام والمفاصل' },
  'R21': { name_ar: 'طفح جلدي', description_ar: 'طفح جلدي وغير محدد', category_ar: 'أمراض الجلدية' },
  'K59.1': { name_ar: 'إسهال', description_ar: 'إسهال وظيفي', category_ar: 'أمراض الجهاز الهضمي' },
  'G47.00': { name_ar: 'أرق', description_ar: 'أرق غير محدد', category_ar: 'أمراض الجهاز العصبي' },
  'F41.9': { name_ar: 'قلق', description_ar: 'اضطراب القلق غير المحدد', category_ar: 'الصحة النفسية' },
  'I10': { name_ar: 'ارتفاع ضغط الدم', description_ar: 'ارتفاع ضغط الدم الأساسي', category_ar: 'أمراض القلب والأوعية الدموية' },
  'E11.9': { name_ar: 'داء السكري من النوع الثاني', description_ar: 'داء السكري من النوع الثاني بدون مضاعفات', category_ar: 'الغدد الصماء' },
  'J18.9': { name_ar: 'التهاب الرئة', description_ar: 'التهاب الرئة غير المحدد', category_ar: 'أمراض الجهاز التنفسي' },
  'N39.0': { name_ar: 'عدوى المسالك البولية', description_ar: 'التهابات المسالك البولية', category_ar: 'أمراض المسالك البولية' },
  'K21.0': { name_ar: 'ارتجاع المريء', description_ar: 'مرض ارتجاع المريء مع التهاب', category_ar: 'أمراض الجهاز الهضمي' },
  'L30.9': { name_ar: 'التهاب الجلد', description_ar: 'التهاب الجلد غير المحدد', category_ar: 'أمراض الجلدية' },
  'S69.9': { name_ar: 'إصابة المعصم', description_ar: 'إصابة غير محددة في المعصم واليد', category_ar: 'الإصابات' },
  'Z00.0': { name_ar: 'فحص عام', description_ar: 'فحص عام وفحص طبي شامل', category_ar: 'الرعاية الوقائية' },
  'Z23': { name_ar: 'تطعيم', description_ar: 'التطعيم', category_ar: 'الرعاية الوقائية' },
};

const MEDICATIONS_ARABIC: Record<string, { name_ar: string; usage_ar: string }> = {
  'Amoxicillin': { name_ar: 'أموكسيسيلين', usage_ar: 'مضاد حيوي' },
  'Ibuprofen': { name_ar: 'إيبوبروفين', usage_ar: 'مسكن للآلام والتهابات' },
  'Paracetamol': { name_ar: 'باراسيتامول', usage_ar: 'مسكن للآلام وخافض للحرارة' },
  'Omeprazole': { name_ar: 'أوميبرازول', usage_ar: 'مثبط لمضخة البروتون' },
  'Metformin': { name_ar: 'ميتفورمين', usage_ar: 'للسكري من النوع الثاني' },
  'Amlodipine': { name_ar: 'أملوديبين', usage_ar: 'حاصرات قنوات الكالسيوم' },
  'Atorvastatin': { name_ar: 'أتورفاستاتين', usage_ar: ' مضاد للكولسترول' },
  'Losartan': { name_ar: 'لوسابتان', usage_ar: 'حاصر مستقبلات الأنجيوتنسين' },
  'Azithromycin': { name_ar: 'أزيثرومايسين', usage_ar: 'مضاد حيوي ماكولايد' },
  'Cetirizine': { name_ar: 'سيتيريزين', usage_ar: 'مضاد للهيستامين' },
  'Salbutamol': { name_ar: 'سالبيوتامول', usage_ar: 'موسع للشعب الهوائية' },
  'Diclofenac': { name_ar: 'ديكلوفيناك', usage_ar: 'مضاد للالتهابات غير الستيرويدية' },
  'Pantoprazole': { name_ar: 'بانتوبرازول', usage_ar: 'مثبط لمضخة البروتون' },
  'Ciprofloxacin': { name_ar: 'سيبروفلوكساسين', usage_ar: 'مضاد حيوي كينولون' },
  'Prednisolone': { name_ar: 'بريدنيزولون', usage_ar: 'คอรتيكوستيرويد' },
  'Aspirin': { name_ar: 'أسبرين', usage_ar: 'مسكن ومضاد للصفيحات' },
  'Diazepam': { name_ar: 'ديازيبام', usage_ar: 'مدرج بنزوديازيبين' },
  'Naproxen': { name_ar: 'نابروكسين', usage_ar: 'مضاد للالتهابات غير الستيرويدية' },
  'Fluoxetine': { name_ar: 'فلوكسيتين', usage_ar: 'مثبط انتقائي لاسترداد السيروتونين' },
};

export async function registerMedicalContentModule(app: FastifyInstance) {

  // ICD-10 with Arabic translations
  app.get('/api/v1/icd10/arabic', async (request, reply) => {
    const query = z.object({ q: z.string().optional().default(''), page: z.coerce.number().optional().default(1), limit: z.coerce.number().optional().default(20) }).parse(request.query);
    let dbQuery = db('icd10_codes');
    if (query.q) dbQuery = dbQuery.where(function () {
      this.whereILike('code', `%${query.q}%`).orWhereILike('name', `%${query.q}%`);
      // Also search Arabic translations
      const arabicMatches = Object.entries(ICD10_ARABIC)
        .filter(([_, v]) => v.name_ar.includes(query.q) || v.description_ar.includes(query.q))
        .map(([code]) => code);
      if (arabicMatches.length) this.orWhereIn('code', arabicMatches);
    });
    const total = await dbQuery.clone().count('id as count').first();
    const data = await dbQuery.clone().orderBy('code').limit(query.limit).offset((query.page - 1) * query.limit);

    // Merge Arabic translations
    const enriched = data.map((item: Record<string, unknown>) => {
      const arabic = ICD10_ARABIC[item.code as keyof typeof ICD10_ARABIC];
      return { ...item, name_ar: arabic?.name_ar || item.name, description_ar: arabic?.description_ar || '', category_ar: arabic?.category_ar || '' };
    });
    return sendPaginated(reply, enriched, Number(total?.count || 0), query.page, query.limit);
  });

  // Medications with Arabic translations
  app.get('/api/v1/medications/arabic', async (request, reply) => {
    const query = z.object({ q: z.string().optional().default(''), page: z.coerce.number().optional().default(1), limit: z.coerce.number().optional().default(20) }).parse(request.query);
    let dbQuery = db('medication_database');
    if (query.q) dbQuery = dbQuery.where(function () {
      this.whereILike('name', `%${query.q}%`);
      const arabicMatches = Object.entries(MEDICATIONS_ARABIC)
        .filter(([_, v]) => v.name_ar.includes(query.q))
        .map(([name]) => name);
      if (arabicMatches.length) this.orWhereIn('name', arabicMatches);
    });
    const total = await dbQuery.clone().count('id as count').first();
    const data = await dbQuery.clone().orderBy('name').limit(query.limit).offset((query.page - 1) * query.limit);
    const enriched = data.map((item: Record<string, unknown>) => {
      const arabic = MEDICATIONS_ARABIC[item.name as keyof typeof MEDICATIONS_ARABIC];
      return { ...item, name_ar: arabic?.name_ar || item.name, usage_ar: arabic?.usage_ar || '' };
    });
    return sendPaginated(reply, enriched, Number(total?.count || 0), query.page, query.limit);
  });

}
