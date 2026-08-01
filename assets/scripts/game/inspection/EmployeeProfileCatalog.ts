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
    portraitSpriteFrameUuid: '3fa51d63-bee2-4a83-9e65-621e66021b8f@f9941',
    disguisedSpriteFrameUuid: '61636d6d-9ff4-4476-ae94-15aaa74dcabe@f9941',
    monsterPortraitSpriteFrameUuid: 'fb653f86-10cd-4b9c-a0c5-241704e5eac7@f9941',
    monsterFullbodySpriteFrameUuid: 'e197a746-4a95-4dff-b7a0-11abd352319f@f9941',
  },
  ethan: {
    key: 'ethan',
    inspectionEnabled: true,
    displayName: 'Ethan',
    employeeId: '867530',
    validUntil: '1999-12-03',
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
    portraitSpriteFrameUuid: 'd8d0dd3d-3919-4702-8bab-b0a7ad69eb79@f9941',
    disguisedSpriteFrameUuid: '149abb3b-18df-47f2-9a5a-cc7419028d6d@f9941',
    monsterPortraitSpriteFrameUuid: '84b92b58-4976-40a3-846f-f58e1c9da67e@f9941',
    monsterFullbodySpriteFrameUuid: '073075f0-4917-46fa-8a34-598c609c6923@f9941',
  },
  sam: {
    key: 'sam',
    inspectionEnabled: true,
    displayName: 'Sam',
    employeeId: '481206',
    validUntil: '1999-12-06',
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
    portraitSpriteFrameUuid: '77bf3f53-9419-49d9-9e02-5e6842ea43f9@f9941',
    disguisedSpriteFrameUuid: '66b6bd7d-6e98-4b2d-b892-ebc880268f8f@f9941',
    monsterPortraitSpriteFrameUuid: 'f5fd7287-a507-46c2-be6c-93dc45fd1eb5@f9941',
    monsterFullbodySpriteFrameUuid: '78e947cb-a8fe-4c43-bedf-eb31b8680128@f9941',
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
    portraitSpriteFrameUuid: 'fb1193ad-141b-4e72-ab0c-37806ded9939@f9941',
    disguisedSpriteFrameUuid: '7ffdfdcc-b36a-4e7f-9e96-3c3a2deab9e2@f9941',
    monsterPortraitSpriteFrameUuid: '426091de-764c-4338-a225-6a89fde77b3b@f9941',
    monsterFullbodySpriteFrameUuid: '55a3d6db-3a5e-4226-97af-104825ab16ac@f9941',
  },
  jake: {
    key: 'jake',
    inspectionEnabled: true,
    displayName: 'Jake',
    employeeId: '624935',
    validUntil: '1999-12-05',
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
    portraitSpriteFrameUuid: 'b4b7f2e2-ea45-495a-b888-70dba58ac1ae@f9941',
    disguisedSpriteFrameUuid: 'c58f728d-6a8b-4fc7-a42e-ef13005248fe@f9941',
    monsterPortraitSpriteFrameUuid: 'dfac01d4-a01d-4721-94c6-4ed3fc482cd8@f9941',
    monsterFullbodySpriteFrameUuid: '46be86aa-f1b3-4378-9d16-81c9b032102e@f9941',
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
    validUntil: '1999-12-05',
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
    portraitSpriteFrameUuid: '38f109ef-60af-4c94-8c34-6cfb9c3d0af3@f9941',
    disguisedSpriteFrameUuid: '3371499a-fda9-49ec-92ca-ca88a8b227ff@f9941',
    monsterPortraitSpriteFrameUuid: '60083929-505b-4f1c-b81f-388eed2839ef@f9941',
    monsterFullbodySpriteFrameUuid: 'cd126bf8-e51c-4c96-a931-50217878cd96@f9941',
  },
  clara: {
    key: 'clara',
    inspectionEnabled: true,
    displayName: 'Clara',
    employeeId: '731318',
    validUntil: '1999-12-06',
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
    portraitSpriteFrameUuid: 'd296e6b0-12d1-4d2a-8b07-b7cb637d0b69@f9941',
    disguisedSpriteFrameUuid: '25f4cf09-656f-4c21-a196-c0ff6782eb0f@f9941',
    monsterPortraitSpriteFrameUuid: '9feb034e-143f-44d8-ab6d-3397a897bc4c@f9941',
    monsterFullbodySpriteFrameUuid: '3101cef6-3c11-404e-9206-2e9b4402769e@f9941',
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
    portraitSpriteFrameUuid: 'cfd87454-5786-43b6-b729-a87bbf647aaf@f9941',
    disguisedSpriteFrameUuid: 'f9b35321-d7d7-4ec8-81b5-93991e16dd26@f9941',
    monsterPortraitSpriteFrameUuid: '80e1baed-9d3a-4944-8f64-4afff1e1d007@f9941',
    monsterFullbodySpriteFrameUuid: '3d0f1dc7-0588-4a28-ac0a-667ac9be3191@f9941',
  },
  maya: {
    key: 'maya',
    inspectionEnabled: true,
    displayName: 'Maya',
    employeeId: '731587',
    validUntil: '1999-12-05',
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
    portraitSpriteFrameUuid: 'cfb9609c-abeb-4034-9a6f-a654fe4a39c1@f9941',
    disguisedSpriteFrameUuid: '025859fd-23da-4e79-a4da-15270156e616@f9941',
    monsterPortraitSpriteFrameUuid: '622ee2ac-ceef-4c6e-ac61-2b039fd16f41@f9941',
    monsterFullbodySpriteFrameUuid: '6a2dfdf5-b73e-46b2-873d-ca77537d64c3@f9941',
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
    spriteFrameUuid: '61636d6d-9ff4-4476-ae94-15aaa74dcabe@f9941',
    failedRuleKeys: ['carter_hair_orange', 'carter_eyeshadow_orange_yellow'],
  },
  {
    employeeKey: 'ethan',
    variantKey: 'ethan_disguised_v1',
    spriteFrameUuid: '149abb3b-18df-47f2-9a5a-cc7419028d6d@f9941',
    failedRuleKeys: ['ethan_large_eyes'],
  },
  {
    employeeKey: 'sam',
    variantKey: 'sam_disguised_v1',
    spriteFrameUuid: '66b6bd7d-6e98-4b2d-b892-ebc880268f8f@f9941',
    failedRuleKeys: ['sam_skin_pale_warm'],
  },
  {
    employeeKey: 'mark',
    variantKey: 'mark_disguised_v1',
    spriteFrameUuid: '7ffdfdcc-b36a-4e7f-9e96-3c3a2deab9e2@f9941',
    failedRuleKeys: ['mark_eyebrows_thick'],
  },
  {
    employeeKey: 'jake',
    variantKey: 'jake_disguised_v1',
    spriteFrameUuid: 'c58f728d-6a8b-4fc7-a42e-ef13005248fe@f9941',
    failedRuleKeys: ['jake_iris_gray_blue'],
  },
  {
    employeeKey: 'alice',
    variantKey: 'alice_disguised_v1',
    spriteFrameUuid: '3371499a-fda9-49ec-92ca-ca88a8b227ff@f9941',
    failedRuleKeys: ['alice_iris_gray_blue'],
  },
  {
    employeeKey: 'clara',
    variantKey: 'clara_disguised_v1',
    spriteFrameUuid: '25f4cf09-656f-4c21-a196-c0ff6782eb0f@f9941',
    failedRuleKeys: ['clara_hair_golden_blonde'],
  },
  {
    employeeKey: 'grace',
    variantKey: 'grace_disguised_v1',
    spriteFrameUuid: 'f9b35321-d7d7-4ec8-81b5-93991e16dd26@f9941',
    failedRuleKeys: ['grace_hair_golden_blonde'],
  },
  {
    employeeKey: 'maya',
    variantKey: 'maya_disguised_v1',
    spriteFrameUuid: '025859fd-23da-4e79-a4da-15270156e616@f9941',
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
