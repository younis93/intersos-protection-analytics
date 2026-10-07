"""Deterministic translations of generated details; free text remains original."""
import re

EXACT = {
    '# total assessments is 0': 'عدد التقييمات الإجمالي هو 0',
    '# Total Services is 0': 'عدد الخدمات الإجمالي هو 0',
    'No linked legal service': 'لا توجد خدمة قانونية مرتبطة',
    'Missing Assessment ID': 'رقم التقييم مفقود',
    'Date is blank': 'التاريخ فارغ',
    'Assessment status is Pending': 'حالة التقييم هي Pending',
    'Open assessment needs counselling only': 'التقييم المفتوح يحتاج إلى الاستشارة فقط',
    'Type of Legal Service Needed is blank': 'حقل نوع الخدمة القانونية المطلوبة فارغ',
    'Age is blank, non-numeric, below 0, or above 110': 'العمر فارغ أو غير رقمي أو أقل من 0 أو أكبر من 110',
    'Spouse DoB is not a valid date': 'تاريخ ميلاد الزوج أو الزوجة غير صالح',
    'Spouse DoB is later than the current date': 'تاريخ ميلاد الزوج أو الزوجة بعد التاريخ الحالي',
    'Detained immigration case has counselling only': 'حالة الهجرة المحتجزة تتلقى الاستشارة فقط',
    'Adult assessment requests representation and counselling, but linked legal services have no counselling': 'تقييم البالغ يطلب التمثيل والاستشارة، لكن الخدمات المرتبطة لا تتضمن الاستشارة',
    'Non-IDP has Assistance/Representation, was created in 2026 or later, and is not detained': 'الحالة ليست لنازح داخلي، وتتضمن المساعدة أو التمثيل، وأنشئت في 2026 أو بعده، والمستفيد غير محتجز',
}
PATTERNS = [
    (r'Name and session topic occur (\d+) times', 'يتكرر الاسم وموضوع الجلسة {0} مرات'),
    (r'Name occurs (\d+) times across different sessions', 'يتكرر الاسم {0} مرات في جلسات مختلفة'),
    (r'(\d+) digits', 'عدد الأرقام: {0}'),
    (r'Current age is (.+) based on date of birth', 'العمر الحالي هو {0} وفقاً لتاريخ الميلاد'),
    (r'Recorded age is (.+); date of birth is unavailable', 'العمر المسجل هو {0}؛ تاريخ الميلاد غير متاح'),
    (r'Spouse is (.+) years old based on date of birth', 'عمر الزوج أو الزوجة هو {0} سنة وفقاً لتاريخ الميلاد'),
    (r'Detained beneficiary is (.+) years old', 'عمر المستفيد المحتجز هو {0} سنة'),
    (r'Open assessment has (\d+) linked service\(s\), all with a closed or completed status', 'التقييم مفتوح وله {0} خدمة مرتبطة، وجميعها بحالة مغلقة أو مكتملة'),
    (r'Possible duplicate with (\d+) matching record\(s\)\. Verify the case references and responsible lawyers below\.', 'اشتباه في التكرار مع {0} سجل مطابق. يرجى التحقق من مراجع الحالات والمحامين المسؤولين أدناه.'),
    (r'Missing linked legal service type\(s\): (.+)', 'أنواع الخدمات القانونية المرتبطة المفقودة: {0}'),
    (r'Detention Governorate is missing; expected one of: (.+)', 'محافظة الاحتجاز مفقودة؛ القيم المتوقعة: {0}'),
    (r'Detention Governorate (.+) does not match Project/Project Location \((.+)\)', 'محافظة الاحتجاز {0} لا تطابق المشروع أو موقعه ({1})'),
    (r'Refugee assessment dated (.+): Detained is Yes but immigration charge is blank or No', 'تقييم اللاجئ بتاريخ {0}: حالة الاحتجاز Yes، لكن تهمة الهجرة فارغة أو No'),
    (r'Refugee assessment dated (.+): Detained is No but immigration charge is populated', 'تقييم اللاجئ بتاريخ {0}: حالة الاحتجاز No، لكن تهمة الهجرة مسجلة'),
    (r'Selected month (.+); (\d+) earlier (assessment|service)\(s\), from (.+) to (.+); created on (.+)', 'الشهر المحدد {0}؛ عدد السجلات السابقة {1} ({2})، من {3} إلى {4}؛ تاريخ الإنشاء {5}'),
]

def arabic_detail(value: str) -> str:
    if value in EXACT:
        return EXACT[value]
    for pattern, template in PATTERNS:
        match = re.fullmatch(pattern, value)
        if match:
            return template.format(*match.groups())
    return ''
