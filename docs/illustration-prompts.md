# 부자할미 타이쿤 일러스트 리디자인 프롬프트 초안

이 문서는 기존 SVG 캐릭터와 마이룸을 새 2D 일러스트 에셋으로 교체하기 위한 1차 제작 브리프입니다. 캐릭터 기준 원화를 먼저 확정한 뒤 표정·의상·집 배경을 같은 기준으로 생성합니다. 이미지에 글자, UI, 로고를 넣지 않습니다.

## 공통 아트 디렉션

아래 문장을 모든 생성 프롬프트의 앞부분에 붙여 스타일을 고정합니다.

> **STYLE LOCK —** A polished 2D Korean webtoon illustration for a cozy personal-finance game for women in their 20s and 30s. Warm, affectionate, playful and reassuring. Soft clean hand-inked outlines, rounded organic silhouettes, gentle cel shading with subtle watercolor-like color transitions, warm pastel palette of cream, peach, dusty rose, sage green, muted lavender and honey gold. Charming Korean editorial illustration, carefully finished and readable at small mobile-screen size. Consistent character proportions and consistent outline weight across every asset. Absolutely flat 2D artwork: no 3D render, no photorealism, no glossy plastic, no hard shadows.

**팔레트 기준:** 크림 `#FFF8EB`, 피치 `#F4C8B7`, 코랄 `#E89182`, 세이지 `#92A47E`, 연보라 `#C7B7D1`, 꿀색 `#D9B56F`, 선화 `#71594F`. 명도와 채도는 부드럽게 유지하고 화면마다 같은 색을 재사용합니다.

## 1. 캐릭터 기준 원화

먼저 캐릭터의 얼굴·머리·체형·옷을 고정할 전신 기준 이미지를 만듭니다.

```text
STYLE LOCK.
Create the definitive character reference for “Rich Grandma Tycoon”: a lovable young-at-heart Korean grandmother investor mascot, full body, front view, standing with a relaxed welcoming posture. Super-deformed chibi proportions, exactly 2.25 heads tall; oversized round head, soft full cheeks, short plump arms and legs, mitten-like hands and tiny feet, smooth mochi-like silhouette without realistic joints. Slightly wide-set, round clear dark-brown eyes with warm highlights, tiny nose, small gentle smile, permanent soft coral-peach blush on both cheeks. Distinctive softly waved dark-brown bob with a subtle silver streak, small pearl hairpin, cream cardigan over a dusty-rose blouse, muted sage long skirt, simple dark-brown loafers. One hand holds a tiny gold coin purse; the other offers a small encouraging wave. Warm, dependable, witty and affectionate expression. Centered, complete silhouette with comfortable margins, simple plain warm-cream backdrop, clean readable shapes, beautifully finished 2D Korean webtoon line art.
Keep the face design, hair silhouette, skin tone, proportions, clothing, line weight and palette identical in every later character asset. No text, no lettering, no charts, no money symbols floating around, no props covering the body, no cropped limbs, no extra fingers, no realistic anatomy, no 3D, no gradients that look metallic.
```

## 2. 감정 표정 시트

기준 원화를 이미지 참조로 함께 넣고 다섯 표정을 한 장의 균등한 시트로 생성합니다. 옷과 포즈는 고정하고 얼굴만 바뀌도록 합니다.

```text
STYLE LOCK. Use the attached definitive Rich Grandma Tycoon character reference. Create one clean expression reference sheet with exactly five equal-sized panels in a single horizontal row. Show the same character from chest up, same scale, same face shape, same hair, same outfit and same camera angle in every panel. Leave generous clean gutters between panels. Left to right: 1) neutral — relaxed round open eyes and a tiny gentle smile; 2) happy — closed crescent eyes, delighted open U-shaped smile, a few tiny warm sparkles; 3) stoic — soft half-lidded dot eyes and a short straight mouth; 4) playfully annoyed — one slightly lifted brow and a tiny pout, affectionate rather than angry; 5) tearful — glossy round eyes and two small clear cartoon tears, a tender trembling pout. Keep the same subtle peach-coral cheek blush in every expression. Warm, kind and endearing, never frightening or mean. Flat 2D webtoon drawing, consistent clean linework, plain warm-cream background, no words, labels or speech bubbles.
```

## 3. 캐릭터 모션·전신 표정 시트

홈 화면과 작은 보상 연출에 사용할 전신 표정 확인용입니다. 실제 애니메이션 프레임으로 쓸 때는 패널의 바깥 여백과 크기를 동일하게 유지합니다.

```text
STYLE LOCK. Use the attached definitive character reference. A production-ready 5-panel full-body pose sheet of the exact same 2.25-head-tall chibi grandma character, on a transparent background, one character per equally sized panel, consistent baseline and scale. Left to right: calm welcoming idle pose; joyful pose celebrating a savings goal with tiny sparkles; blank-but-cute budgeting pose holding a small notebook; gentle scolding pose pointing at a tiny shopping receipt; sympathetic teary pose holding a handkerchief. Keep face, silver-streaked waved bob, pearl hairpin, cream cardigan, dusty-rose blouse, sage skirt, shoes, skin tone and outlines identical in all panels. Short plump limbs and rounded mochi silhouette. Clear separation between poses, no overlap, no cast shadow outside each panel, no text or UI, no extra characters, no photorealism, no 3D.
```

## 4. 조합형 캐릭터 파츠 시트

기준 원화를 이미지 참조로 넣습니다. 이 시트는 콘셉트 초안용이며, 최종 앱 적용 전에는 각 파츠를 같은 크기의 투명 PNG로 따로 추출하고 위치를 맞춥니다.

```text
STYLE LOCK. Use the attached definitive Rich Grandma Tycoon character as an exact construction reference. Create a perfectly aligned modular 2D avatar asset atlas on a transparent background, arranged on a precise labeled-by-position but UNLETTERED grid; do not draw labels, cell borders or captions. Every cell has the same character scale, head center, shoulders, waist and foot baseline. Separate cells with generous transparent gutters. Rows: five distinct but stylistically matching hair silhouettes; five eye styles with identical eye centers and spacing; five subtle face/cheek silhouette variations with the same ear anchors; five compatible warm skin-tone swatches shown on the same face silhouette; five tops (basic tee, soft blouse, tailored jacket, cozy knit, classic tweed); five bottoms (jeans, slacks, H-line skirt, relaxed joggers, long skirt); three shoes (sneakers, loafers, dress shoes). Maintain the exact wide-set eyes, gentle facial design, 2.25-head chibi proportions, soft clean outline and pastel palette from the reference. Isolated, front-facing, no perspective changes between cells, no part overlaps adjacent cells, no scenery, no text, no extra variants beyond the specified counts.
```

> 파츠 시트를 그대로 UI에 연결하기보다 기준 원화를 먼저 고른 다음, 파츠별 시트를 따로 뽑는 편이 크기·정렬·외곽선이 일정합니다. 생성 모델은 같은 캐릭터를 픽셀 단위로 완벽하게 반복하지 않으므로 마지막에 눈·얼굴·의상 레이어를 직접 정렬하는 아트 정리가 필요합니다.

## 5. 마이룸 배경 공통 프롬프트

캐릭터는 별도 SVG/PNG 레이어로 중앙에 합성합니다. 모든 집 그림은 동일한 정면 컷어웨이 구도와 바닥선을 공유합니다.

```text
STYLE LOCK. Create a clean, front-facing 2D Korean webtoon room background for the Rich Grandma Tycoon mobile game, wide landscape 4:3 composition. A charming dollhouse-like front cutaway room, viewed straight on at character eye level, with a clearly visible floor and balanced left/right furniture. Reserve the central 30 percent of the image as an uncluttered standing area for a separately layered 2D chibi character; keep furniture, windowsills and plants away from this center zone. Character-free background only. Warm sunlight, soft pastel materials, clean rounded ink outlines, gentle hand-painted details and a cozy lived-in feeling. Keep the floor baseline, camera, room proportions, window position and outline weight identical across all five house stages. No people, no pets, no text, no signs, no logos, no UI, no perspective shift, no 3D, no photorealism.
```

각 집 배경을 만들 때 위 공통 프롬프트 뒤에 해당 단계 설명을 붙입니다.

### Stage 1 — 아늑한 반지하 원룸

```text
HOUSE STAGE 1 variation: a tiny but lovingly cared-for semi-basement studio. A small high-set window shows a quiet neighborhood at eye level, sheer cream curtains, a compact sage loveseat, a low round table, one potted plant, a warm floor lamp and a small bookshelf. The room feels modest, safe, personal and hopeful, never dirty, dark, depressing or unsafe. Simple affordable furniture, lots of warm cream wall and floor visible.
```

### Stage 2 — 채광 좋은 오피스텔

```text
HOUSE STAGE 2 variation: a bright, tidy Korean officetel. A taller sunlit window with a soft city view, airy cream curtains, a comfortable small sofa, a neat desk and laptop, two leafy plants, a compact dining table and a warm pendant light. More breathing room and brighter daylight than stage 1, with gentle sage and peach accents.
```

### Stage 3 — 역세권 투룸 아파트

```text
HOUSE STAGE 3 variation: a welcoming two-room Korean apartment near a subway station. A generous city window, soft rug, comfortable two-seat sofa, low coffee table, bookcase, dining nook, several healthy plants and a small framed abstract floral print with no writing. Spacious and stable, thoughtfully decorated in warm pastel colors; visibly more comfortable than stage 2 without looking luxurious.
```

### Stage 4 — 한강뷰 펜트하우스

```text
HOUSE STAGE 4 variation: an elegant but cozy Seoul penthouse living room with a broad panoramic window looking toward the Han River and distant bridges at golden hour. Plush curved sofa, refined coffee table, large soft rug, tasteful chandelier, tall plant and a few understated gold details. Keep it warm and lived-in, not cold or ostentatious. The river-and-bridge view is clearly recognizable but remains a soft pastel illustration.
```

### Stage 5 — 정원이 있는 대저택

```text
HOUSE STAGE 5 variation: a generous, sun-filled mansion sitting room opening onto a private flowering garden. Broad garden-facing windows, a graceful chandelier, inviting sofa, elegant tea table, leafy indoor plants, warm rug and subtle heirloom details. Through the windows: soft green lawn, rounded flowerbeds and a tiny fountain. Feel celebratory, secure and abundant while remaining affectionate and approachable; avoid palace scale, excessive gold, sharp luxury branding or a cold formal mood.
```

## 6. 공통 네거티브 프롬프트

```text
photorealistic, 3D render, CGI, anime sharp eyes, realistic adult anatomy, long limbs, thin fashion-model body, tiny head, sharp chin, narrow angry eyes, harsh contrast, hard black shadows, neon colors, oversaturated palette, horror, mean expression, heavy wrinkles, elderly stereotype, luxury brand logos, readable text, watermark, signature, speech bubble, UI, cropped head, cropped feet, duplicate limbs, extra fingers, inconsistent character face, inconsistent costume, tilted camera, dramatic perspective, clutter covering the center standing area
```

## 제작 순서 제안

1. 기준 원화를 먼저 선택하고 피부색·머리 실루엣·기본 의상을 확정합니다.
2. 기준 원화를 참조 이미지로 고정한 채 표정 시트와 전신 포즈를 생성합니다.
3. 집 배경은 공통 프롬프트와 단계별 설명을 사용해 5장을 같은 캔버스 비율로 생성합니다.
4. 승인된 이미지에서 캐릭터 파츠를 투명 배경으로 따로 정리하고, 모든 집 배경에서 캐릭터 중앙 위치와 발 기준선을 맞춥니다.
5. 모바일 크기 축소 화면에서 선명도와 색 대비를 확인한 뒤 기존 SVG 렌더러를 새 에셋 렌더러로 교체합니다.
