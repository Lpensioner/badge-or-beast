import { isValidUntilPass } from './InspectionDateRules';
import type { AppearanceVariantDefinition, CaseKind, EmployeeKey, EmployeeProfile } from './InspectionTypes';

export const REASON_FOR_ENTRY_ON_DUTY = 'ON DUTY';

export const EMPLOYEE_PROFILES: Record<EmployeeKey, EmployeeProfile> = {
  carter: {
    key: 'carter',
    inspectionEnabled: true,
    displayName: 'Carter',
    employeeId: '017320',
    validUntil: '2000-03-31',
    position: 'Researcher',
    department: 'Research Department',
    departmentPhone: '9527',
    appearanceRules: [
      {
        key: 'carter_hair_orange',
        expectedValue: 'Orange hair',
        description: 'Orange hair',
        category: 'HAIR_COLOR',
      },
      {
        key: 'carter_eyeshadow_orange_yellow',
        expectedValue: 'Orange-yellow eyeshadow',
        description: 'Orange-yellow eyeshadow',
        category: 'OTHER_VISIBLE',
      },
      {
        key: 'carter_mole_collarbone',
        expectedValue: 'A mole above the collarbone',
        description: 'A mole above the collarbone',
        category: 'MOLE',
      },
    ],
    portraitSpriteFrameUuid: '5009fd28-5a6f-45e5-8ec9-bcfccaf26716@f9941',
    disguisedSpriteFrameUuid: 'bb23291b-5729-487a-821e-59af68459de7@f9941',
    monsterPortraitSpriteFrameUuid: 'b5b5d394-6250-4508-bdab-7c9f70c61f27@f9941',
    monsterFullbodySpriteFrameUuid: '3f916b20-3ee2-4908-94b5-53894bed6b18@f9941',
  },
  ethan: {
    key: 'ethan',
    inspectionEnabled: true,
    displayName: 'Ethan',
    employeeId: '867530',
    validUntil: '2000-01-01',
    position: 'Research Assistant',
    department: 'Research Department',
    departmentPhone: '9527',
    appearanceRules: [
      {
        key: 'ethan_large_eyes',
        expectedValue: 'Large, prominent eyes',
        description: 'Large, prominent eyes',
        category: 'OTHER_VISIBLE',
      },
    ],
    flavorTraits: ['Frequently adjusts and plays with his hairstyle'],
    portraitSpriteFrameUuid: 'df714aba-3909-44ed-919f-89cfe5c6e73e@f9941',
    disguisedSpriteFrameUuid: 'c5e77514-2c5d-4753-bbd0-aa9cf053aa05@f9941',
    monsterPortraitSpriteFrameUuid: 'e2089b12-8333-4484-8181-8a8b458d8cf6@f9941',
    monsterFullbodySpriteFrameUuid: '73a07cc9-6413-4388-81e0-93b508bc0edb@f9941',
  },
  sam: {
    key: 'sam',
    inspectionEnabled: true,
    displayName: 'Sam',
    employeeId: '481206',
    validUntil: '2000-01-01',
    position: 'Research Team Lead',
    department: 'Research Department',
    departmentPhone: '9527',
    appearanceRules: [
      {
        key: 'sam_skin_pale_warm',
        expectedValue: 'Pale, warm-toned skin',
        description: 'Pale, warm-toned skin',
        category: 'SKIN_TONE',
      },
      {
        key: 'sam_hair_groomed',
        expectedValue: 'Carefully maintains his hairstyle',
        description: 'Carefully maintains his hairstyle',
        category: 'HAIRSTYLE',
      },
    ],
    flavorTraits: ['Gentle', 'Helpful'],
    portraitSpriteFrameUuid: '4109284e-e557-4d77-9bbc-ec2a80ae0ac0@f9941',
    disguisedSpriteFrameUuid: '7d573907-a488-4d83-8161-cb233ba64087@f9941',
    monsterPortraitSpriteFrameUuid: '10add6a7-7c0b-442d-a5b3-96b6014317e5@f9941',
    monsterFullbodySpriteFrameUuid: '29c98405-1243-467b-8514-7569d2f03064@f9941',
  },
  mark: {
    key: 'mark',
    inspectionEnabled: true,
    displayName: 'Mark',
    employeeId: '624817',
    validUntil: '1999-12-03',
    position: 'Production Manager',
    department: 'Production Department',
    departmentPhone: '6842',
    appearanceRules: [
      {
        key: 'mark_eyebrows_thick',
        expectedValue: 'Thick, prominent eyebrows',
        description: 'Thick, prominent eyebrows',
        category: 'EYEBROWS',
      },
      {
        key: 'mark_no_facial_mole',
        expectedValue: 'No facial moles',
        description: 'No facial moles',
        category: 'MOLE',
      },
    ],
    portraitSpriteFrameUuid: '7ef2a95f-1202-4dae-b870-3a7a9081053f@f9941',
    disguisedSpriteFrameUuid: '79e3b12f-70bf-40c3-ae94-a39d81753a4e@f9941',
    monsterPortraitSpriteFrameUuid: '53db6a9e-f922-4da2-8f6e-8d3a622838d2@f9941',
    monsterFullbodySpriteFrameUuid: 'ee964dcd-27f3-4da7-9a8b-6df866544b4a@f9941',
  },
  jake: {
    key: 'jake',
    inspectionEnabled: true,
    displayName: 'Jake',
    employeeId: '624935',
    validUntil: '1999-12-07',
    position: 'Production Technician',
    department: 'Production Department',
    departmentPhone: '6842',
    appearanceRules: [
      {
        key: 'jake_iris_gray_blue',
        expectedValue: 'Gray-blue irises',
        description: 'Gray-blue irises',
        category: 'EYE_COLOR',
      },
      {
        key: 'jake_eyebrows_groomed',
        expectedValue: 'Carefully maintains and protects his eyebrows',
        description: 'Carefully maintains and protects his eyebrows',
        category: 'EYEBROWS',
      },
    ],
    flavorTraits: ['Reserved', 'Aloof'],
    portraitSpriteFrameUuid: '2acf45bf-0a65-4f48-8b15-c21ddb8017ea@f9941',
    disguisedSpriteFrameUuid: 'c38f561a-0053-4281-bfa1-b3ff89e041bc@f9941',
    monsterPortraitSpriteFrameUuid: '75668cb0-0863-41bd-b05b-8c6491ef49f0@f9941',
    monsterFullbodySpriteFrameUuid: 'e48ec2db-7854-4058-930d-e0b4e627406a@f9941',
    windowPortraitPresentation: {
      scale: 1.38,
      offsetX: 0,
      offsetY: -4,
    },
  },
  alice: {
    key: 'alice',
    inspectionEnabled: true,
    displayName: 'Alice',
    employeeId: '731204',
    validUntil: '1999-12-07',
    position: 'Sales Associate',
    department: 'Sales Department',
    departmentPhone: '7716',
    appearanceRules: [
      {
        key: 'alice_iris_gray_blue',
        expectedValue: 'Gray-blue irises',
        description: 'Gray-blue irises',
        category: 'EYE_COLOR',
      },
      {
        key: 'alice_earrings_usually',
        expectedValue: 'Usually wears earrings',
        description: 'Usually wears earrings',
        category: 'EARRINGS',
      },
    ],
    portraitSpriteFrameUuid: 'edcdcd60-e964-4dd4-aa1c-8b7efd9aafd8@f9941',
    disguisedSpriteFrameUuid: '85cd25ff-a7ee-4a65-9e8f-4e76eef23dda@f9941',
    monsterPortraitSpriteFrameUuid: 'e6b86d1e-c1f4-46c5-a0e8-136479ee01b3@f9941',
    monsterFullbodySpriteFrameUuid: '182668e2-480c-4f2e-8775-acd952f54552@f9941',
  },
  clara: {
    key: 'clara',
    inspectionEnabled: true,
    displayName: 'Clara',
    employeeId: '731318',
    validUntil: '1999-12-08',
    position: 'Sales Supervisor',
    department: 'Sales Department',
    departmentPhone: '7716',
    appearanceRules: [
      {
        key: 'clara_hair_golden_blonde',
        expectedValue: 'Golden blonde hair',
        description: 'Golden blonde hair',
        category: 'HAIR_COLOR',
      },
      {
        key: 'clara_lipstick_red',
        expectedValue: 'Wears vivid red lipstick',
        description: 'Wears vivid red lipstick',
        category: 'LIPSTICK',
      },
    ],
    flavorTraits: ['Generous'],
    portraitSpriteFrameUuid: 'fc16b2e5-0f2f-4338-8a46-71271e897659@f9941',
    disguisedSpriteFrameUuid: '9e801cef-0ada-429c-b450-0cb698d419c2@f9941',
    monsterPortraitSpriteFrameUuid: 'a3c79519-55fd-4b11-ac04-174f09f7d512@f9941',
    monsterFullbodySpriteFrameUuid: 'ad64f1ab-d8b6-4515-b59d-53c07ca4eaa4@f9941',
  },
  grace: {
    key: 'grace',
    inspectionEnabled: true,
    displayName: 'Grace',
    employeeId: '731426',
    validUntil: '1999-12-04',
    position: 'Sales Associate',
    department: 'Sales Department',
    departmentPhone: '7716',
    appearanceRules: [
      {
        key: 'grace_hair_golden_blonde',
        expectedValue: 'Golden blonde hair',
        description: 'Golden blonde hair',
        category: 'HAIR_COLOR',
      },
      {
        key: 'grace_no_necklace',
        expectedValue: 'Does not wear necklaces',
        description: 'Does not wear necklaces',
        category: 'NECKLACE',
      },
    ],
    portraitSpriteFrameUuid: '8c81e690-9798-424b-92ce-187d07f59875@f9941',
    disguisedSpriteFrameUuid: '4ddeda17-59ae-4986-99a5-cfe0740e0199@f9941',
    monsterPortraitSpriteFrameUuid: '71f06467-d243-40e4-bfc7-947a8999d2f7@f9941',
    monsterFullbodySpriteFrameUuid: '8205632d-0987-439f-b6c6-79b57d5c10f2@f9941',
  },
  maya: {
    key: 'maya',
    inspectionEnabled: true,
    displayName: 'Maya',
    employeeId: '731587',
    validUntil: '1999-12-07',
    position: 'Sales Intern',
    department: 'Sales Department',
    departmentPhone: '7716',
    appearanceRules: [
      {
        key: 'maya_mole_nose_tip',
        expectedValue: 'A small mole near the tip of her nose',
        description: 'A small mole near the tip of her nose',
        category: 'MOLE',
      },
      {
        key: 'maya_no_silver_accessories',
        expectedValue: 'Does not wear silver accessories',
        description: 'Does not wear silver accessories',
        category: 'SILVER_ACCESSORIES',
      },
    ],
    portraitSpriteFrameUuid: '248475dc-6653-4d97-b5eb-55fafd7efa14@f9941',
    disguisedSpriteFrameUuid: '3a1c2c48-2ac2-4d97-8a45-a607c99a7d8c@f9941',
    monsterPortraitSpriteFrameUuid: '5afd076a-b05b-44b3-9c7b-e13e49382a41@f9941',
    monsterFullbodySpriteFrameUuid: '64dd9412-9b71-4eb2-82d6-7e9e00066b82@f9941',
  },
};

export const EMPLOYEE_KEYS: EmployeeKey[] = Object.keys(EMPLOYEE_PROFILES) as EmployeeKey[];
export const INSPECTION_ENABLED_EMPLOYEE_KEYS: EmployeeKey[] = EMPLOYEE_KEYS.filter(
  (key) => EMPLOYEE_PROFILES[key].inspectionEnabled,
);

export const APPEARANCE_VARIANTS: AppearanceVariantDefinition[] = [
  {
    employeeKey: 'carter',
    variantKey: 'carter_disguised_v1',
    spriteFrameUuid: 'bb23291b-5729-487a-821e-59af68459de7@f9941',
    failedRuleKeys: ['carter_hair_orange', 'carter_eyeshadow_orange_yellow'],
  },
  {
    employeeKey: 'ethan',
    variantKey: 'ethan_disguised_v1',
    spriteFrameUuid: 'c5e77514-2c5d-4753-bbd0-aa9cf053aa05@f9941',
    failedRuleKeys: ['ethan_large_eyes'],
  },
  {
    employeeKey: 'sam',
    variantKey: 'sam_disguised_v1',
    spriteFrameUuid: '7d573907-a488-4d83-8161-cb233ba64087@f9941',
    failedRuleKeys: ['sam_skin_pale_warm'],
  },
  {
    employeeKey: 'mark',
    variantKey: 'mark_disguised_v1',
    spriteFrameUuid: '79e3b12f-70bf-40c3-ae94-a39d81753a4e@f9941',
    failedRuleKeys: ['mark_eyebrows_thick'],
  },
  {
    employeeKey: 'jake',
    variantKey: 'jake_disguised_v1',
    spriteFrameUuid: 'c38f561a-0053-4281-bfa1-b3ff89e041bc@f9941',
    failedRuleKeys: ['jake_iris_gray_blue'],
  },
  {
    employeeKey: 'alice',
    variantKey: 'alice_disguised_v1',
    spriteFrameUuid: '85cd25ff-a7ee-4a65-9e8f-4e76eef23dda@f9941',
    failedRuleKeys: ['alice_iris_gray_blue'],
  },
  {
    employeeKey: 'clara',
    variantKey: 'clara_disguised_v1',
    spriteFrameUuid: '9e801cef-0ada-429c-b450-0cb698d419c2@f9941',
    failedRuleKeys: ['clara_hair_golden_blonde'],
  },
  {
    employeeKey: 'grace',
    variantKey: 'grace_disguised_v1',
    spriteFrameUuid: '4ddeda17-59ae-4986-99a5-cfe0740e0199@f9941',
    failedRuleKeys: ['grace_hair_golden_blonde'],
  },
  {
    employeeKey: 'maya',
    variantKey: 'maya_disguised_v1',
    spriteFrameUuid: '3a1c2c48-2ac2-4d97-8a45-a607c99a7d8c@f9941',
    failedRuleKeys: ['maya_mole_nose_tip'],
  },
];

const appearanceVariantMap = new Map<string, AppearanceVariantDefinition[]>();
for (const variant of APPEARANCE_VARIANTS) {
  const list = appearanceVariantMap.get(variant.employeeKey) ?? [];
  list.push(variant);
  appearanceVariantMap.set(variant.employeeKey, list);
}

export function getAppearanceVariantsForEmployee(
  employeeKey: EmployeeKey,
): AppearanceVariantDefinition[] {
  return appearanceVariantMap.get(employeeKey) ?? [];
}

function hasQualifiedDisguisedVariant(employeeKey: EmployeeKey): boolean {
  const profile = EMPLOYEE_PROFILES[employeeKey];
  const variants = getAppearanceVariantsForEmployee(employeeKey);
  return variants.some(
    (variant) =>
      variant.failedRuleKeys.length > 0 &&
      variant.spriteFrameUuid.trim().length > 0 &&
      variant.spriteFrameUuid !== profile.portraitSpriteFrameUuid,
  );
}

export function canEmployeeServeCase(args: {
  employeeKey: EmployeeKey;
  caseKind: CaseKind;
  inspectionDate: string;
  requiredTruth?: {
    idCardPass?: boolean;
    applicationPass?: boolean;
    appearancePass?: boolean;
  };
}): boolean {
  const profile = EMPLOYEE_PROFILES[args.employeeKey];
  if (!profile?.inspectionEnabled) {
    return false;
  }

  const cardValidOnDate = isValidUntilPass(profile.validUntil, args.inspectionDate);
  const requiresCardPass = args.requiredTruth?.idCardPass === true || args.caseKind === 'VALID_HUMAN';
  if (requiresCardPass && !cardValidOnDate) {
    return false;
  }

  if (args.caseKind === 'DISGUISED_MONSTER' || args.requiredTruth?.appearancePass === false) {
    return Boolean(
      profile.monsterPortraitSpriteFrameUuid &&
        profile.monsterFullbodySpriteFrameUuid &&
        hasQualifiedDisguisedVariant(args.employeeKey),
    );
  }

  return true;
}
