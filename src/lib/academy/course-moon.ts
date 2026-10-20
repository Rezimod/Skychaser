// Stellar Academy, unit 1: the Moon.
//
// Five lessons, one per Moon mission at Stellar Base, in the order the game
// opens them. Each lesson teaches what the mission is about, so a child who
// walks out to the ridge, fixes the power or aims the dish knows why.
//
// Rules for this file: every fact is true and rounded the way a teacher
// would round it; no trick questions; wrong options are plainly wrong; each
// `explain` teaches something. Georgian terms follow src/lib/quizzes.ts and
// the game's own strings (solarSystem.moon in src/messages/ka.json).

import type { Card, Unit } from '@/lib/academy/types';

const IMG = {
  moon: '/images/planets/moon.jpg',
  earth: '/images/planets/earth.jpg',
  moonSky: '/sky/targets/moon.jpg',
  sun: '/sky/targets/sun.jpg',
  base: '/explore/site/shots/moon-base-640.webp',
  cosmonaut: '/explore/site/shots/moon-cosmonaut-640.webp',
  jetpack: '/explore/site/shots/moon-jetpack-640.webp',
  braking: '/explore/site/shots/moon-braking-640.webp',
  powered: '/explore/site/shots/moon-powered-640.webp',
} as const;

export const MOON_CARDS: Card[] = [
  {
    id: 'card-apollo-11',
    name: { ka: 'აპოლო 11', en: 'Apollo 11' },
    fact: {
      ka: 'აპოლო 11-ის მთელმა მოგზაურობამ, გაშვებიდან ოკეანეში დაშვებამდე, სულ რაღაც რვა დღე გასტანა.',
      en: "Apollo 11's whole trip, from launch to splashing down in the ocean, took only about eight days.",
    },
    image: IMG.moon,
  },
  {
    id: 'card-phases',
    name: { ka: 'მთვარის ფაზები', en: 'Phases of the Moon' },
    fact: {
      ka: 'მთვარის ნახევარს მზე ყოველთვის ანათებს — ფაზები მხოლოდ იმას გვიჩვენებს, ამ განათებული ნახევრის რა ნაწილს ვხედავთ დედამიწიდან.',
      en: 'The Moon is always half lit by the Sun — its phases only show how much of that sunny half we can see from Earth.',
    },
    image: IMG.moonSky,
  },
  {
    id: 'card-earthrise',
    name: { ka: '„დედამიწის ამოსვლა“', en: 'Earthrise' },
    fact: {
      ka: 'ცნობილი ფოტო „დედამიწის ამოსვლა“ აპოლო 8-ის ასტრონავტმა ბილ ანდერსმა 1968 წლის 24 დეკემბერს გადაიღო მთვარის ორბიტიდან — მთვარეზე პირველ დაშვებამდე შვიდი თვით ადრე.',
      en: "The famous photo 'Earthrise' was taken by Apollo 8 astronaut Bill Anders on December 24, 1968, from orbit around the Moon — seven months before anyone landed there.",
    },
    image: IMG.earth,
  },
  {
    id: 'card-earth-in-sky',
    name: { ka: 'დედამიწა მთვარის ცაზე', en: "Earth in the Moon's sky" },
    fact: {
      ka: 'მთვარის ცაზე დედამიწის დისკო თითქმის ოთხჯერ უფრო განიერია, ვიდრე ჩვენს ცაზე სავსე მთვარისა.',
      en: 'From the Moon, Earth looks almost four times wider than the full Moon looks to us from Earth.',
    },
    image: IMG.braking,
  },
  {
    id: 'card-maria',
    name: { ka: 'მთვარის ზღვები', en: 'The lunar seas' },
    fact: {
      ka: 'მთვარის „ზღვებში“ წყლის ერთი წვეთიც არ არის — ეს ძველი ლავის ვაკეებია. აპოლო 11 ერთ-ერთ მათგანში, სიმშვიდის ზღვაში დაჯდა.',
      en: "The Moon's 'seas' don't hold a single drop of water — they are old lava plains. Apollo 11 landed in one of them, the Sea of Tranquility.",
    },
    image: IMG.moonSky,
  },
];

export const MOON_UNIT: Unit = {
  id: 'moon',
  title: { ka: 'მთვარე', en: 'The Moon' },
  tagline: { ka: 'ჩვენი უახლოესი კოსმოსური მეზობელი', en: 'Our closest neighbor in space' },
  color: '#9fb7d9',
  image: IMG.moon,
  lessons: [
    // ─── 1 · First Steps ────────────────────────────────────────────────
    {
      id: 'moon-1',
      title: { ka: 'გამარჯობა, მთვარე!', en: 'Hello, Moon' },
      intro: {
        ka: 'შენი სადესანტო აპარატი ცოტა ხანში Stellar-ის ბაზასთან დაჯდება, მთვარის სამხრეთ პოლუსის ახლოს. სანამ ლუქს გააღებ, მოდი, ახალ მეზობელს გავეცნოთ!',
        en: "Your lander is about to touch down at Stellar Base, near the Moon's south pole. Before you open the hatch, let's get to know your new neighbor!",
      },
      card: 'card-apollo-11',
      unlocks: { world: 'moon', mission: 'firstSteps' },
      exercises: [
        {
          id: 'what',
          kind: 'choice',
          image: IMG.moon,
          prompt: { ka: 'რა არის მთვარე?', en: 'What is the Moon?' },
          options: [
            { ka: 'პატარა ვარსკვლავი', en: 'A small star' },
            { ka: 'დედამიწის ბუნებრივი თანამგზავრი', en: "Earth's natural satellite" },
            { ka: 'მანათობელი აირის ღრუბელი', en: 'A cloud of glowing gas' },
          ],
          answer: 1,
          explain: {
            ka: 'მთვარე უზარმაზარი ქვის ბურთია, რომელიც დედამიწის გარშემო მოძრაობს — სწორედ ამას ჰქვია თანამგზავრი. ის არავის აუშენებია, ამიტომაც ბუნებრივია.',
            en: "The Moon is a huge ball of rock that travels around Earth — that's what a satellite is. Nobody built it, so we call it natural.",
          },
        },
        {
          id: 'light',
          kind: 'truefalse',
          image: IMG.sun,
          prompt: { ka: 'მთვარე საკუთარ სინათლეს ასხივებს, ისევე როგორც მზე.', en: 'The Moon makes its own light, just like the Sun.' },
          answer: false,
          explain: {
            ka: 'მთვარეს საკუთარი სინათლე არ აქვს. ის იმიტომ ანათებს, რომ მასზე მზის სინათლე ეცემა და ჩვენკენ აირეკლება.',
            en: 'The Moon has no light of its own. It shines because sunlight lands on it and bounces off toward us.',
          },
        },
        {
          id: 'size',
          kind: 'choice',
          prompt: { ka: 'რა სიგანისაა მთვარე დედამიწასთან შედარებით?', en: 'How wide is the Moon compared to Earth?' },
          options: [
            { ka: 'დაახლოებით დედამიწის ტოლი', en: 'About as wide as Earth' },
            { ka: 'დედამიწაზე ორჯერ დიდი', en: 'About twice as wide' },
            { ka: 'დედამიწის სიგანის დაახლოებით მეოთხედი', en: 'About a quarter as wide' },
          ],
          answer: 2,
          explain: {
            ka: 'მთვარე სიგანით დედამიწაზე დაახლოებით ოთხჯერ პატარაა: ოთხი მთვარე რომ გვერდიგვერდ დაალაგო, დაახლოებით დედამიწის სიგანე გამოვა.',
            en: 'The Moon is only about a quarter as wide as Earth: line up about four Moons side by side and they would stretch across our planet.',
          },
        },
        {
          id: 'numbers',
          kind: 'match',
          prompt: { ka: 'დააკავშირე მთვარის თითოეული ფაქტი თავის რიცხვთან.', en: 'Match each Moon fact to its number.' },
          pairs: [
            { left: { ka: 'მანძილი დედამიწამდე', en: 'Distance from Earth' }, right: { ka: 'დაახლოებით 384 ათასი კმ', en: 'About 384,000 km' } },
            { left: { ka: 'რამდენ ხანს მოდის სინათლე დედამიწამდე', en: 'Time for its light to reach Earth' }, right: { ka: 'დაახლოებით 1.3 წმ', en: 'About 1.3 seconds' } },
            { left: { ka: 'მიზიდულობა დედამიწასთან შედარებით', en: "Gravity compared to Earth's" }, right: { ka: 'დაახლოებით ერთი მეექვსედი', en: 'About one sixth' } },
            { left: { ka: 'პირველი ადამიანები მთვარეზე', en: 'First people walk on the Moon' }, right: { ka: '1969 წლის ივლისი', en: 'July 1969' } },
          ],
          explain: {
            ka: 'მთვარე იმდენად შორსაა, რომ სინათლესაც კი — ყველაზე სწრაფ რამეს სამყაროში — ამ მანძილის გასავლელად წამზე მეტი სჭირდება. მაგრამ საკმარისად ახლოსაა იმისთვის, რომ ადამიანებმა მას 1969 წელს მიაღწიეს!',
            en: 'The Moon is so far away that even light, the fastest thing there is, needs over a second to cross the gap. But it is close enough that people reached it in 1969!',
          },
        },
        {
          id: 'jump',
          kind: 'truefalse',
          prompt: { ka: 'მთვარეზე დაახლოებით ექვსჯერ უფრო მაღლა ახტებოდი, ვიდრე დედამიწაზე.', en: 'On the Moon you could jump about six times higher than on Earth.' },
          answer: true,
          explain: {
            ka: 'მთვარის მიზიდულობა დედამიწისაზე დაახლოებით ექვსჯერ სუსტია, ამიტომ ქვემოთ გაცილებით სუსტად გიზიდავს. თუმცა მძიმე სკაფანდრი ცოტას მაინც გიშლის!',
            en: "The Moon's gravity is about one sixth of Earth's, so it pulls you down much more gently. A heavy spacesuit makes it a little harder, though!",
          },
        },
        {
          id: 'first',
          kind: 'choice',
          prompt: { ka: 'ვინ იყვნენ პირველი ადამიანები, ვინც მთვარეზე გაისეირნეს?', en: 'Who were the first people to walk on the Moon?' },
          options: [
            { ka: 'იური გაგარინი', en: 'Yuri Gagarin' },
            { ka: 'ნილ არმსტრონგი და ბაზ ოლდრინი', en: 'Neil Armstrong and Buzz Aldrin' },
            { ka: 'იქ ჯერ არავის გაუვლია', en: 'Nobody has walked there yet' },
          ],
          answer: 1,
          explain: {
            ka: '1969 წლის 20 ივლისს აპოლო 11 მთვარეზე დაჯდა: არმსტრონგი და ოლდრინი ზედაპირზე გავიდნენ, მაიკლ კოლინზი კი ორბიტაზე დარჩა. იური გაგარინი კი 1961 წელს პირველი ადამიანი იყო კოსმოსში.',
            en: 'On July 20, 1969, Apollo 11 landed and Armstrong and Aldrin stepped outside, while Michael Collins circled above in orbit. Yuri Gagarin was the first person in space, in 1961.',
          },
        },
        {
          id: 'sizes',
          kind: 'order',
          prompt: { ka: 'დაალაგე ზომის მიხედვით: პატარიდან დიდისკენ.', en: 'Put these in order from smallest to biggest.' },
          items: [
            { ka: 'მთვარე', en: 'The Moon' },
            { ka: 'დედამიწა', en: 'Earth' },
            { ka: 'მზე', en: 'The Sun' },
          ],
          explain: {
            ka: 'დედამიწა დაახლოებით ოთხი მთვარის სიგანისაა, მზე კი იმდენად უზარმაზარია, რომ მის სიგანეზე გვერდიგვერდ დაახლოებით 109 დედამიწა დაეტეოდა.',
            en: 'Earth is about four Moons wide, and the Sun is so huge that about 109 Earths would fit across it side by side.',
          },
        },
        {
          id: 'moonwalk',
          kind: 'order',
          image: IMG.base,
          prompt: { ka: 'შენი პირველი გასვლა მთვარეზე! დაალაგე ნაბიჯები.', en: 'Your first moonwalk! Put the steps in order.' },
          items: [
            { ka: 'შეამოწმე სკაფანდრი', en: 'Check your spacesuit' },
            { ka: 'გადი ქედამდე', en: 'Walk to the ridge' },
            { ka: 'გადაიღე დედამიწა', en: 'Photograph Earth' },
            { ka: 'დაბრუნდი შლუზით', en: 'Come back in through the airlock' },
          ],
          explain: {
            ka: 'ჯერ ყოველთვის სკაფანდრი შეამოწმე: გარეთ სასუნთქი ჰაერი არ არის. საქმეს რომ მორჩები, შლუზი შიგნით შეგიშვებს ისე, რომ ბაზის ჰაერი გარეთ არ გავიდეს.',
            en: "Always check your suit first: outside there is no air to breathe. When you're done, the airlock lets you back in without letting the base's air escape.",
          },
        },
      ],
    },

    // ─── 2 · Restore Power ──────────────────────────────────────────────
    {
      id: 'moon-2',
      title: { ka: 'დღე და ღამე მთვარეზე', en: 'Day and night on the Moon' },
      intro: {
        ka: 'ვაი, Stellar-ის ბაზაზე შუქი ჩაქრა! სანამ მზის ენერგიას აღადგენ, უნდა გაიგო, როგორ ანათებს მზე მთვარეზე. აქ დღე სულ სხვანაირია, ვიდრე სახლში…',
        en: "Uh-oh, the lights at Stellar Base have gone dim! Before you fix the solar power, you need to know how sunshine works on the Moon. A day here is nothing like a day at home…",
      },
      card: 'card-phases',
      unlocks: { world: 'moon', mission: 'power' },
      exercises: [
        {
          id: 'face',
          kind: 'truefalse',
          image: IMG.moonSky,
          prompt: { ka: 'მთვარე დედამიწისკენ ყოველთვის ერთი და იმავე მხრითაა მობრუნებული.', en: 'The same side of the Moon always faces Earth.' },
          answer: true,
          explain: {
            ka: 'მთვარე თავისი ღერძის გარშემო ზუსტად ერთხელ შემობრუნდება, სანამ დედამიწას ერთხელ შემოუვლის, ამიტომ ყოველთვის მის ერთსა და იმავე მხარეს ვხედავთ. მხარეს, რომელსაც ვერასოდეს ვხედავთ, შორეული მხარე ჰქვია.',
            en: 'The Moon turns around exactly once each time it circles Earth, so we always see the same face. The side we never see is called the far side.',
          },
        },
        {
          id: 'daylength',
          kind: 'choice',
          prompt: { ka: 'რამდენ ხანს გრძელდება მთვარეზე ერთი დღე — ერთი მზის ამოსვლიდან მეორემდე?', en: 'How long is one day on the Moon, from one sunrise to the next?' },
          options: [
            { ka: 'დაახლოებით 24 საათი', en: 'About 24 hours' },
            { ka: 'დაახლოებით ერთი წელი', en: 'About one year' },
            { ka: 'დაახლოებით 29.5 დედამიწისეული დღე', en: 'About 29.5 Earth days' },
          ],
          answer: 2,
          explain: {
            ka: 'მთვარე ძალიან ნელა ბრუნავს, ამიტომ ერთი მზის ამოსვლიდან მეორემდე დაახლოებით 29.5 დედამიწისეული დღე გადის — თითქმის მთელი თვე!',
            en: 'The Moon turns very slowly, so from one sunrise to the next takes about 29.5 Earth days — almost a whole month!',
          },
        },
        {
          id: 'twoweeks',
          kind: 'truefalse',
          prompt: {
            ka: 'მთვარის უმეტეს ადგილას მზე დაახლოებით ორი კვირა ანათებს, შემდეგ კი დაახლოებით ორი კვირა ბნელა.',
            en: 'In most places on the Moon, the Sun shines for about two weeks, and then it is dark for about two weeks.',
          },
          answer: true,
          explain: {
            ka: 'მთვარის ერთი დღე დაახლოებით 29.5 დედამიწისეულ დღეს გრძელდება: დაახლოებით ნახევარი დღეა, ნახევარი კი — ღამე. მზის ამოსვლას ძალიან დიდხანს უნდა ელოდო!',
            en: "A whole Moon day lasts about 29.5 Earth days, so roughly half of it is daytime and half is night. That's a very long wait for sunrise!",
          },
        },
        {
          id: 'batteries',
          kind: 'choice',
          prompt: { ka: 'რატომ სჭირდება Stellar-ის ბაზას მზის პანელების გარდა აკუმულატორებიც?', en: 'Why does Stellar Base need batteries as well as solar panels?' },
          options: [
            { ka: 'აკუმულატორები მზის სინათლეს აძლიერებენ', en: 'Batteries make sunlight brighter' },
            { ka: 'რომ დენი არ გაითიშოს, როცა პანელებს მზე არ ანათებს', en: 'To keep the power on when no sunlight reaches the panels' },
            { ka: 'რომ ბაზა უფრო მძიმე გახდეს', en: 'To make the base heavier' },
          ],
          answer: 1,
          explain: {
            ka: 'მზის პანელები ელექტროენერგიას მხოლოდ მაშინ გამოიმუშავებენ, როცა მათ მზე ანათებს. აკუმულატორები მზიან საათებში ზედმეტ ენერგიას ინახავენ, ასე რომ, სიბნელეშიც შუქი ანთია.',
            en: 'Solar panels only make electricity when sunlight hits them. Batteries save up extra energy during sunny hours, so the lights stay on in the dark.',
          },
        },
        {
          id: 'phases',
          kind: 'order',
          prompt: {
            ka: 'დაალაგე მთვარის ფაზები ისე, როგორც დედამიწიდან ვხედავთ. დაიწყე ახალი მთვარით.',
            en: "Put the Moon's phases in order, as we see them from Earth. Start with the new Moon.",
          },
          items: [
            { ka: 'ახალი მთვარე', en: 'New Moon' },
            { ka: 'პირველი მეოთხედი', en: 'First quarter' },
            { ka: 'სავსე მთვარე', en: 'Full Moon' },
            { ka: 'ბოლო მეოთხედი', en: 'Last quarter' },
          ],
          explain: {
            ka: 'ახალი მთვარის შემდეგ განათებული ნაწილი ნახევრამდე იზრდება (პირველი მეოთხედი), მერე სრულ წრემდე, შემდეგ კი ისევ ნახევრამდე მცირდება (ბოლო მეოთხედი). მთელ ციკლს დაახლოებით 29.5 დღე სჭირდება.',
            en: 'After the new Moon, the lit part grows to a half (first quarter), then a full circle, then shrinks back to a half (last quarter). The whole cycle takes about 29.5 days.',
          },
        },
        {
          id: 'temperature',
          kind: 'match',
          prompt: { ka: 'დააკავშირე თითოეული ადგილი თავის ტემპერატურასთან.', en: 'Match each place to its temperature.' },
          pairs: [
            { left: { ka: 'მთვარის ზედაპირი მზის შუქზე', en: 'Moon ground in sunshine' }, right: { ka: 'დაახლოებით +120 °C', en: 'About +120 °C' } },
            { left: { ka: 'მთვარის ზედაპირი ღამით', en: 'Moon ground at night' }, right: { ka: '−150 °C-ზე უფრო ცივი', en: 'Colder than −150 °C' } },
            { left: { ka: 'ქვაბში მდუღარე წყალი', en: 'Water boiling in a pot' }, right: { ka: 'დაახლოებით +100 °C', en: 'About +100 °C' } },
          ],
          explain: {
            ka: 'ჰაერი არ არის, რომ სითბო გადაანაწილოს, ამიტომ მთვარის ზედაპირი დღისით მდუღარე წყალზე ცხელია, ღამით კი დედამიწის ნებისმიერ ზამთარზე ცივი.',
            en: "With no air to spread the heat around, the Moon's ground gets hotter than boiling water by day and colder than any winter on Earth at night.",
          },
        },
        {
          id: 'farside',
          kind: 'truefalse',
          prompt: { ka: 'მთვარის შორეულ მხარეს მუდამ ბნელა.', en: 'The far side of the Moon is always dark.' },
          answer: false,
          explain: {
            ka: 'შორეულ მხარესაც ზუსტად იმდენივე მზე ანათებს, რამდენიც ჩვენკენ მობრუნებულ მხარეს. როცა ჩვენთან ახალი მთვარეა, შორეული მხარე მთლიანად განათებულია!',
            en: 'The far side gets just as much sunshine as the side we see. When we have a new Moon, the far side is in full daylight!',
          },
        },
        {
          id: 'panels',
          kind: 'choice',
          image: IMG.base,
          prompt: {
            ka: 'რატომ დგას Stellar-ის ბაზის მზის პანელები ვერტიკალურად და არა მიწაზე გაშლილი?',
            en: 'Why do the solar panels at Stellar Base stand upright instead of lying flat?',
          },
          options: [
            { ka: 'რომ ასტრონავტებმა ზედ სარეცხი გაფინონ', en: 'So astronauts can hang their washing on them' },
            { ka: 'სამხრეთ პოლუსთან მზე ჰორიზონტთან დაბლაა, ამიტომ ვერტიკალური პანელები მეტ სინათლეს იჭერენ', en: 'Near the south pole the Sun stays low, so upright panels catch more light' },
            { ka: 'რადგან გაშლილი პანელები დადნებოდა', en: 'Because flat panels would melt' },
          ],
          answer: 1,
          explain: {
            ka: 'პოლუსებთან მზე ცაში მაღლა არასოდეს ადის — ცას ჰორიზონტთან ახლოს შემოუვლის. ვერტიკალური პანელები მისკენ გაცილებით უკეთ იყურებიან და თან მას მიჰყვებიან.',
            en: 'Near the poles the Sun never climbs high: it slides around the sky close to the horizon. Upright panels face it far better, and they turn to follow it.',
          },
        },
      ],
    },

    // ─── 3 · Telescope Calibration ──────────────────────────────────────
    {
      id: 'moon-3',
      title: { ka: 'ცა ჰაერის გარეშე', en: 'A sky without air' },
      intro: {
        ka: 'ქედზე ტელესკოპი დგას, რომელიც ჯერ არავის ჩაურთავს. დღეს პირველად შენ ჩაიხედავ მასში! მაგრამ რატომ დგამენ ტელესკოპს სწორედ მთვარეზე?',
        en: 'Up on the ridge stands a telescope that no one has ever switched on. Tonight you will be the first to look through it! But why put a telescope on the Moon at all?',
      },
      card: 'card-earthrise',
      unlocks: { world: 'moon', mission: 'telescope' },
      exercises: [
        {
          id: 'air',
          kind: 'choice',
          prompt: { ka: 'რამდენი ჰაერია მთვარეზე?', en: 'How much air does the Moon have?' },
          options: [
            { ka: 'დედამიწაზე ბევრად მეტი', en: 'Much more than Earth' },
            { ka: 'დაახლოებით იმდენივე, რამდენიც დედამიწაზე', en: 'About the same as Earth' },
            { ka: 'თითქმის არაფერი', en: 'Almost none' },
          ],
          answer: 2,
          explain: {
            ka: 'მთვარეს თითქმის არ აქვს ატმოსფერო: მისი მიზიდულობა საკმარისად ძლიერი არ არის, რომ ბევრი აირი დაიჭიროს. ამიტომაც ასტრონავტებს სასუნთქი ჰაერი სკაფანდრით თან დააქვთ.',
            en: "The Moon has almost no atmosphere: its gravity is too weak to hold on to much gas. That's why astronauts carry their own air in their spacesuits.",
          },
        },
        {
          id: 'blacksky',
          kind: 'truefalse',
          image: IMG.jetpack,
          prompt: { ka: 'მთვარეზე ცა შავია, დღისითაც კი.', en: 'On the Moon the sky is black, even in the daytime.' },
          answer: true,
          explain: {
            ka: 'დედამიწაზე ჰაერი მზის სინათლეს აბნევს და ცას ლურჯად ღებავს. მთვარეზე ჰაერი არ არის, ამიტომ ცა შავი რჩება მაშინაც, როცა მზე ამოსულია.',
            en: 'On Earth, air scatters sunlight and paints the sky blue. With no air on the Moon, the sky stays black even when the Sun is up.',
          },
        },
        {
          id: 'footprints',
          kind: 'choice',
          image: IMG.cosmonaut,
          prompt: { ka: 'რატომ შეიძლება ასტრონავტების ნაკვალევი მთვარეზე მილიონობით წელი დარჩეს?', en: "Why can astronauts' footprints stay on the Moon for millions of years?" },
          options: [
            { ka: 'ასტრონავტები მათ წებოთი ამაგრებენ', en: 'Astronauts glue them in place' },
            { ka: 'იქ არც ქარია და არც წვიმა, რომ წაშალოს', en: 'There is no wind or rain to wipe them away' },
            { ka: 'ყოველ ნაკვალევს რობოტი დარაჯობს', en: 'Robots guard every footprint' },
          ],
          answer: 1,
          explain: {
            ka: 'დედამიწაზე ქარი და წვიმა ნაკვალევს რამდენიმე დღეში შლის. მთვარეზე მას ვერაფერი ჰფანტავს და ვერაფერი რეცხავს, ამიტომ ძალიან, ძალიან ნელა ქრება.',
            en: 'On Earth, wind and rain smooth footprints away in days. On the Moon nothing blows or washes them away, so they fade very, very slowly.',
          },
        },
        {
          id: 'sound',
          kind: 'truefalse',
          prompt: { ka: 'მთვარეზე რომ დაიყვირო, რამდენიმე ნაბიჯში მდგარი მეგობარი გაიგონებს.', en: 'If you shouted on the Moon, a friend a few steps away would hear you.' },
          answer: false,
          explain: {
            ka: 'ხმა ჰაერში ვრცელდება, მთვარეზე კი ჰაერი არ არის, რომ ხმა გადაიტანოს. ამიტომაც ასტრონავტები ერთმანეთს რაციით ელაპარაკებიან.',
            en: "Sound travels through air, and on the Moon there is no air to carry it. That's why astronauts talk to each other by radio.",
          },
        },
        {
          id: 'noair',
          kind: 'match',
          prompt: { ka: 'დააკავშირე მიზეზი და შედეგი: რა ხდება მთვარეზე ჰაერის გარეშე?', en: 'Match each cause to what it leads to on the Moon.' },
          pairs: [
            { left: { ka: 'ჰაერი არ არის, რომ ხმა გადაიტანოს', en: 'No air to carry sound' }, right: { ka: 'ასტრონავტები რაციით საუბრობენ', en: 'Astronauts talk by radio' } },
            { left: { ka: 'არც ქარია, არც წვიმა', en: 'No wind or rain' }, right: { ka: 'ნაკვალევი ძალიან დიდხანს რჩება', en: 'Footprints last a very long time' } },
            { left: { ka: 'ჰაერი არ არის, რომ მზის სინათლე გაფანტოს', en: 'No air to scatter sunlight' }, right: { ka: 'ცა დღისითაც შავია', en: 'The sky is black by day' } },
            { left: { ka: 'ჰაერი არ არის, რომ ვარსკვლავების შუქი აამღვრიოს', en: 'No air to blur starlight' }, right: { ka: 'ვარსკვლავები არ ციმციმებენ', en: "Stars don't twinkle" } },
          ],
          explain: {
            ka: 'დედამიწაზე მოძრავი ჰაერი ვარსკვლავებს აციმციმებს და ტელესკოპის გამოსახულებას ამღვრევს. მთვარეზე ვარსკვლავების შუქი სუფთა და მშვიდი აღწევს.',
            en: 'On Earth, moving air makes stars twinkle and blurs what telescopes see. On the Moon, starlight arrives clear and steady.',
          },
        },
        {
          id: 'telescope',
          kind: 'choice',
          prompt: { ka: 'რატომ არის მთვარე ტელესკოპისთვის შესანიშნავი ადგილი?', en: 'Why is the Moon a great place for a telescope?' },
          options: [
            { ka: 'იქ არც ჰაერია და არც ღრუბლები, რომ ხედი აამღვრიოს ან დაფაროს', en: 'There is no air or clouds to blur or hide the view' },
            { ka: 'იქ ვარსკვლავები გაცილებით დიდია', en: 'The stars are much bigger there' },
            { ka: 'იქ არასოდეს ბნელდება', en: 'It never gets dark there' },
          ],
          answer: 0,
          explain: {
            ka: 'დედამიწაზე ტელესკოპი ჰაერის სქელ ფენაში იყურება, ცას კი ხშირად ღრუბლები ფარავს. მთვარეზე ცა ყოველთვის მოწმენდილია.',
            en: 'On Earth, telescopes must look through a thick blanket of air, and clouds often hide the sky. On the Moon the view is always clear.',
          },
        },
        {
          id: 'earthphases',
          kind: 'truefalse',
          image: IMG.earth,
          prompt: {
            ka: 'მთვარიდან დანახულ დედამიწასაც აქვს ფაზები, ისევე როგორც დედამიწიდან დანახულ მთვარეს.',
            en: 'From the Moon, Earth shows phases too, just like the Moon does from Earth.',
          },
          answer: true,
          explain: {
            ka: 'მზე დედამიწის ერთ ნახევარს ანათებს, ამიტომ მთვარიდან შეიძლება დაინახო სავსე დედამიწა, ნახევარი დედამიწა ან წვრილი ნამგალი. როცა ჩვენთან ახალი მთვარეა, მთვარეზე „სავსე დედამიწა“ ჩანს!',
            en: 'The Sun lights up one half of Earth, so from the Moon you can see a full Earth, a half Earth or a thin crescent. When we have a new Moon, the Moon has a full Earth!',
          },
        },
        {
          id: 'distances',
          kind: 'order',
          prompt: { ka: 'დაალაგე მთვარიდან მანძილის მიხედვით: უახლოესიდან ყველაზე შორეულამდე.', en: 'Put these in order, from nearest to the Moon to farthest away.' },
          items: [
            { ka: 'დედამიწა', en: 'Earth' },
            { ka: 'მზე', en: 'The Sun' },
            { ka: 'სხვა ვარსკვლავები', en: 'Other stars' },
          ],
          explain: {
            ka: 'დედამიწა დაახლოებით 384 ათასი კმ-ითაა დაშორებული, მზე — დაახლოებით 150 მილიონი კმ-ით. უახლოესი სხვა ვარსკვლავი კი ისე შორსაა, რომ მისი სინათლე ჩვენამდე ოთხ წელზე მეტ ხანს მოდის.',
            en: 'Earth is about 384,000 km away and the Sun about 150 million km. Even the nearest other star is so far that its light takes more than four years to reach us.',
          },
        },
      ],
    },

    // ─── 4 · Comms Failure ──────────────────────────────────────────────
    {
      id: 'moon-4',
      title: { ka: 'ალო, დედამიწა!', en: 'Calling Earth' },
      intro: {
        ka: 'დედამიწა გაჩუმდა: Stellar-ის ბაზის დიდი ანტენა მიმართულებას ასცდა. სახლში ყველა შენს ამბავს ელოდება! მოდი, გავიგოთ, როგორ მიფრინავს შეტყობინება მთვარიდან დედამიწამდე.',
        en: "Earth has gone quiet: the big dish at Stellar Base has been knocked out of line. Everyone back home is waiting to hear from you! Let's find out how a message flies from the Moon to Earth.",
      },
      card: 'card-earth-in-sky',
      unlocks: { world: 'moon', mission: 'comms' },
      exercises: [
        {
          id: 'how',
          kind: 'choice',
          prompt: { ka: 'როგორ მიდის შეტყობინება მთვარიდან დედამიწამდე?', en: 'How does a message travel from the Moon to Earth?' },
          options: [
            { ka: 'ძალიან გრძელი კაბელით', en: 'Through a very long cable' },
            { ka: 'წერილებით სავსე რაკეტით', en: 'In a rocket full of letters' },
            { ka: 'რადიოტალღებით', en: 'As radio waves' },
          ],
          answer: 2,
          explain: {
            ka: 'ბაზა შეტყობინებებს რადიოტალღებით აგზავნის. ხმისგან განსხვავებით, რადიოტალღები ცარიელ სივრცეშიც ვრცელდება, სადაც ჰაერი საერთოდ არ არის.',
            en: 'The base sends messages as radio waves. Unlike sound, radio waves can cross empty space, where there is no air at all.',
          },
        },
        {
          id: 'speed',
          kind: 'choice',
          prompt: { ka: 'რა სიჩქარით მოძრაობს რადიოტალღები?', en: 'How fast do radio waves travel?' },
          options: [
            { ka: 'მანქანასავით', en: 'As fast as a car' },
            { ka: 'სინათლის სიჩქარით — წამში დაახლოებით 300 ათასი კმ', en: 'At the speed of light: about 300,000 km every second' },
            { ka: 'რეაქტიული თვითმფრინავივით', en: 'As fast as a jet plane' },
          ],
          answer: 1,
          explain: {
            ka: 'რადიოტალღები სინათლის ერთ-ერთი სახეა, რომელსაც ჩვენი თვალი ვერ ხედავს, ამიტომ ისინიც სინათლის სიჩქარით მოძრაობს. სამყაროში ამაზე სწრაფი არაფერია.',
            en: "Radio waves are a kind of light our eyes can't see, so they move at the speed of light. Nothing in the universe is faster.",
          },
        },
        {
          id: 'delay',
          kind: 'choice',
          prompt: { ka: 'დაახლოებით რამდენ ხანში აღწევს შენი შეტყობინება დედამიწამდე?', en: 'About how long does your message take to reach Earth?' },
          options: [
            { ka: 'დაახლოებით 1.3 წმ-ში', en: 'About 1.3 seconds' },
            { ka: 'დაახლოებით 1 საათში', en: 'About 1 hour' },
            { ka: 'დაახლოებით 3 დღეში', en: 'About 3 days' },
          ],
          answer: 0,
          explain: {
            ka: 'სინათლის სიჩქარითაც კი 384 ათასი კმ-ის გავლას წამზე ცოტა მეტი სჭირდება. ამიტომ დედამიწიდან პასუხი კითხვის დასმიდან სულ მცირე 2.6 წმ-ში მოდის: 1.3 წმ იქით და 1.3 წმ აქეთ.',
            en: 'Even at the speed of light, the 384,000 km trip takes a little over a second. So an answer from Earth arrives at least 2.6 seconds after you ask: 1.3 there and 1.3 back.',
          },
        },
        {
          id: 'dish',
          kind: 'truefalse',
          prompt: { ka: 'თეფშისებრი ანტენა ყველაზე კარგად მაშინ მუშაობს, როცა პირდაპირ დედამიწისკენაა მიმართული.', en: 'A dish antenna works best when it points straight at Earth.' },
          answer: true,
          explain: {
            ka: 'თეფში რადიოტალღებს ვიწრო სხივად კრებს, როგორც ფანარი. თუ სხვა მხარესაა მიმართული, სხივი დედამიწას ასცდება და კავშირი წყდება.',
            en: 'A dish gathers radio waves into a narrow beam, like a flashlight. If it points the wrong way, the beam misses Earth and the line goes quiet.',
          },
        },
        {
          id: 'earthstill',
          kind: 'truefalse',
          image: IMG.braking,
          prompt: {
            ka: 'Stellar-ის ბაზიდან დედამიწა ყოველდღე ამოდის და ჩადის, ისევე როგორც მზე ჩვენთან.',
            en: 'From Stellar Base, Earth rises and sets every day, just like the Sun does at home.',
          },
          answer: false,
          explain: {
            ka: 'მთვარე ჩვენკენ მუდამ ერთი მხრითაა მობრუნებული, ამიტომ ახლო მხრიდან დედამიწა ცაზე თითქმის არ ინაცვლებს. თუ ანტენას ერთხელ დედამიწაზე დაუმიზნებ, ის მიზანზე დარჩება.',
            en: 'Because the Moon always keeps the same face toward us, Earth hardly moves in the sky over the near side. Once the dish is aimed at Earth, it stays on target.',
          },
        },
        {
          id: 'call',
          kind: 'order',
          prompt: { ka: 'დაალაგე რადიოსაუბრის ნაბიჯები.', en: 'Put the radio call in order.' },
          items: [
            { ka: 'რაციაში ლაპარაკობ', en: 'You speak into your radio' },
            { ka: 'ანტენა დედამიწისკენ რადიოტალღებს აგზავნის', en: 'The dish sends radio waves toward Earth' },
            { ka: '1.3 წმ-ის შემდეგ შენი ხმა მისიის მართვის ცენტრში ისმის', en: 'Mission Control hears you 1.3 seconds later' },
            { ka: 'მათი პასუხი მთვარეზე ბრუნდება', en: 'Their answer flies back to the Moon' },
          ],
          explain: {
            ka: 'ყოველი საუბარი ორმხრივი მოგზაურობაა: 384 ათასი კმ იქით და ამდენივე აქეთ. ამიტომაა დედამიწასთან საუბარში მოკლე პაუზები.',
            en: "Every call makes a round trip: 384,000 km there and the same back. That's why talks with Earth have short pauses.",
          },
        },
        {
          id: 'trips',
          kind: 'match',
          prompt: { ka: 'დააკავშირე თითოეული მოგზაურობა მის ხანგრძლივობასთან.', en: 'Match each trip to how long it takes.' },
          pairs: [
            { left: { ka: 'რადიოშეტყობინება მთვარიდან დედამიწამდე', en: 'A radio message from the Moon to Earth' }, right: { ka: 'დაახლოებით 1.3 წმ', en: 'About 1.3 seconds' } },
            { left: { ka: 'კითხვა და პასუხი, იქით და აქეთ', en: 'A question and its answer, there and back' }, right: { ka: 'დაახლოებით 2.6 წმ', en: 'About 2.6 seconds' } },
            { left: { ka: 'მზის სინათლე მზიდან დედამიწამდე', en: 'Sunlight from the Sun to Earth' }, right: { ka: 'დაახლოებით 8 წუთი', en: 'About 8 minutes' } },
            { left: { ka: 'აპოლოს ასტრონავტების ფრენა დედამიწიდან მთვარემდე', en: 'Apollo astronauts flying from Earth to the Moon' }, right: { ka: 'დაახლოებით 3 დღე', en: 'About 3 days' } },
          ],
          explain: {
            ka: 'სინათლე და რადიოტალღები ყველაზე სწრაფი მოგზაურები არიან, კოსმოსური ხომალდები კი გაცილებით ნელია: აპოლოს ეკიპაჟებს მთვარემდე მისასვლელად დაახლოებით სამი დღე სჭირდებოდათ.',
            en: 'Light and radio waves are the fastest travelers there are, but spacecraft are much slower: the Apollo crews needed about three days to reach the Moon.',
          },
        },
        {
          id: 'apollo',
          kind: 'choice',
          prompt: { ka: 'როგორ ესაუბრებოდნენ აპოლოს ასტრონავტები დედამიწაზე მისიის მართვის ცენტრს?', en: 'How did the Apollo astronauts talk to Mission Control on Earth?' },
          options: [
            { ka: 'ძალიან ხმამაღლა ყვირილით', en: 'By shouting really loudly' },
            { ka: 'რადიოთი', en: 'By radio' },
            { ka: 'ღია ბარათების გაგზავნით', en: 'By sending postcards' },
          ],
          answer: 1,
          explain: {
            ka: 'აშშ-ში, ქალაქ ჰიუსტონში მდებარე მისიის მართვის ცენტრი ეკიპაჟებს მთელი ფრენის განმავლობაში რადიოთი ესაუბრებოდა. იქაური მეცნიერები და ინჟინრები ასტრონავტებს ყოველ ნაბიჯზე ეხმარებოდნენ.',
            en: 'Mission Control in Houston, USA, talked with the crews by radio the whole time. Scientists and engineers there helped the astronauts with every step.',
          },
        },
      ],
    },

    // ─── 5 · Rover Expedition ───────────────────────────────────────────
    {
      id: 'moon-5',
      title: { ka: 'კრატერები და ქვები', en: 'Craters and rocks' },
      intro: {
        ka: 'როვერი დატენილია, იქვე კი კრატერია, სადაც ფეხი ჯერ არავის დაუდგამს. შენი ამოცანაა, მთვარის ქანის ნიმუში მოიტანო. აი, რა იცის ყველა მთვარის გეოლოგმა!',
        en: "The rover is charged, and out there is a crater no one has ever visited. Your job: bring back a sample of Moon rock. Here's what every Moon geologist knows!",
      },
      card: 'card-maria',
      unlocks: { world: 'moon', mission: 'expedition' },
      exercises: [
        {
          id: 'craters',
          kind: 'choice',
          image: IMG.powered,
          prompt: { ka: 'როგორ გაჩნდა მთვარის კრატერების უმეტესობა?', en: "How were most of the Moon's craters made?" },
          options: [
            { ka: 'მდინარეებმა გამორეცხეს', en: 'Rivers washed them out' },
            { ka: 'მთვარეს კოსმოსიდან ქვები დაეჯახა', en: 'Rocks from space crashed into the Moon' },
            { ka: 'უზარმაზარმა თხუნელებმა ამოთხარეს', en: 'Giant moles dug them' },
          ],
          answer: 1,
          explain: {
            ka: 'კოსმოსში მოფრენილი ქვები მთვარეს უზარმაზარი სიჩქარით ეჯახება და მრგვალ ორმოებს ტოვებს. ჰაერი არ არის, რომელშიც ისინი გზაში დაიწვებოდნენ, ამიტომ პატარა ქვებიც კი ზედაპირამდე აღწევს.',
            en: 'Rocks flying through space hit the Moon very fast and blast out round holes. With no air to burn them up on the way, even small ones reach the ground.',
          },
        },
        {
          id: 'seas',
          kind: 'truefalse',
          image: IMG.moonSky,
          prompt: { ka: 'მთვარის მუქი ლაქები, რომლებსაც „ზღვებს“ უწოდებენ, წყლით არის სავსე.', en: "The dark patches on the Moon, called 'seas', are full of water." },
          answer: false,
          explain: {
            ka: '„ზღვები“ ძველი ლავის ვრცელი ვაკეებია: ლავა ოდესღაც ამოიღვარა და მუქ ქანად გაცივდა. ძველ ასტრონომებს ეგონათ, რომ ეს შეიძლება წყალი ყოფილიყო, და სახელიც შემორჩა.',
            en: "The 'seas' are wide plains of lava that poured out long ago and cooled into dark rock. Early astronomers thought they might be water, and the name stuck.",
          },
        },
        {
          id: 'regolith',
          kind: 'choice',
          prompt: { ka: 'რა ჰქვია ნაცრისფერ მტვერს, რომელიც მთვარეს ფარავს?', en: 'What is the grey dust that covers the Moon called?' },
          options: [
            { ka: 'რეგოლითი', en: 'Regolith' },
            { ka: 'მთვარის თოვლი', en: 'Moon snow' },
            { ka: 'ვარსკვლავის ფხვნილი', en: 'Star powder' },
          ],
          answer: 0,
          explain: {
            ka: 'რეგოლითი მტვრისა და დამსხვრეული ქანების ფენაა, რომელიც მილიარდობით წლის განმავლობაში ზედაპირზე ქვების დაცემამ შექმნა. მისი მარცვლები ბასრია, რადგან იქ არც ქარია და არც წყალი, რომ ისინი წაამრგვალოს.',
            en: 'Regolith is a layer of dust and broken rock, made by space rocks smashing the surface for billions of years. Its grains are sharp, because no wind or water has ever rounded them off.',
          },
        },
        {
          id: 'words',
          kind: 'match',
          prompt: { ka: 'დააკავშირე მთვარის სიტყვები მათ მნიშვნელობასთან.', en: 'Match each Moon word to what it means.' },
          pairs: [
            { left: { ka: 'კრატერი', en: 'Crater' }, right: { ka: 'დაჯახებით გაჩენილი მრგვალი ორმო', en: 'A round hole made by a crash' } },
            { left: { ka: 'მთვარის „ზღვა“', en: 'Lunar sea (mare)' }, right: { ka: 'ძველი ლავის მუქი ვაკე', en: 'A dark plain of old lava' } },
            { left: { ka: 'რეგოლითი', en: 'Regolith' }, right: { ka: 'ნაცრისფერი მტვერი და ქანის ნამსხვრევები', en: 'Grey dust and broken rock' } },
            { left: { ka: 'ნიმუში', en: 'Sample' }, right: { ka: 'შესასწავლად აღებული ქანის ნატეხი', en: 'A piece of rock collected for study' } },
          ],
          explain: {
            ka: 'კრატერები, „ზღვები“ და რეგოლითი ის სამი რამაა, რასაც მთვარეზე ყველაზე ხშირად ნახავ. ნიმუშებით კი მეცნიერები მათ ისტორიას იგებენ.',
            en: "Craters, seas and regolith are the three things you'll see most on the Moon. Samples are how scientists learn their story.",
          },
        },
        {
          id: 'apollorocks',
          kind: 'choice',
          prompt: { ka: 'რამდენი მთვარის ქანი ჩამოიტანეს დედამიწაზე აპოლოს ასტრონავტებმა?', en: 'How much Moon rock did the Apollo astronauts bring back to Earth?' },
          options: [
            { ka: 'დაახლოებით 1 კგ', en: 'About 1 kg' },
            { ka: 'დაახლოებით 1 მილიონი კგ', en: 'About 1 million kg' },
            { ka: 'დაახლოებით 382 კგ', en: 'About 382 kg' },
          ],
          answer: 2,
          explain: {
            ka: 'ექვსი დაშვებისას ასტრონავტებმა დაახლოებით 382 კგ ქანი და მტვერი შეაგროვეს — დაახლოებით ხუთი ზრდასრული ადამიანის წონა. მეცნიერები მათ დღემდე სწავლობენ.',
            en: 'Over six Moon landings, astronauts collected about 382 kg of rocks and dust — about as heavy as five grown-ups. Scientists still study them today.',
          },
        },
        {
          id: 'age',
          kind: 'choice',
          prompt: {
            ka: 'მთვარის ქანების შესწავლით მეცნიერებმა გაარკვიეს, რამდენი წლისაა მთვარე. დაახლოებით რამდენის?',
            en: 'By studying Moon rocks, scientists found out how old the Moon is. About how old?',
          },
          options: [
            { ka: 'დაახლოებით 100 წლის', en: 'About 100 years' },
            { ka: 'დაახლოებით ოთხნახევარი მილიარდი წლის', en: 'About 4.5 billion years' },
            { ka: 'დაახლოებით 1000 წლის', en: 'About 1,000 years' },
          ],
          answer: 1,
          explain: {
            ka: 'მთვარის უძველესი ქანები გვიჩვენებს, რომ მთვარე დაახლოებით ოთხნახევარი მილიარდი წლის წინ გაჩნდა — დედამიწის გაჩენიდან მალევე.',
            en: 'The oldest Moon rocks show that the Moon formed about 4.5 billion years ago, not long after Earth itself.',
          },
        },
        {
          id: 'ice',
          kind: 'truefalse',
          prompt: { ka: 'მთვარის სამხრეთ პოლუსთან, ბნელ კრატერებში, შესაძლოა წყლის ყინული იმალებოდეს.', en: "Water ice may be hiding in dark craters near the Moon's south pole." },
          answer: true,
          explain: {
            ka: 'პოლუსებთან ზოგიერთი კრატერი მუდამ ჩრდილშია, ამიტომ იქ საშინლად ცივა, და კოსმოსურმა აპარატებმა იქ ყინულის ნიშნები აღმოაჩინეს. Stellar-ის ბაზაც სწორედ მათ ახლოსაა!',
            en: 'Some craters near the poles are always in shadow, so they stay extremely cold, and spacecraft have found signs of ice there. Stellar Base is right nearby!',
          },
        },
        {
          id: 'timeline',
          kind: 'order',
          prompt: { ka: 'დაალაგე დროის მიხედვით: უძველესიდან დღევანდლამდე.', en: 'Put these in order, from longest ago to today.' },
          items: [
            { ka: 'მთვარე ჩნდება', en: 'The Moon forms' },
            { ka: 'ლავა მუქ „ზღვებს“ ავსებს', en: 'Lava floods the dark seas' },
            { ka: 'აპოლო 11 მთვარეზე ჯდება', en: 'Apollo 11 lands' },
            { ka: 'შენ შენს ნიმუშს იღებ', en: 'You collect your sample' },
          ],
          explain: {
            ka: 'მთვარე დაახლოებით ოთხნახევარი მილიარდი წლის წინ გაჩნდა, ლავის „ზღვების“ უმეტესობა 3 მილიარდ წელზე მეტი ხნის წინ წარმოიქმნა, აპოლო 11 1969 წელს დაჯდა, შენი ნიმუში კი დღევანდელი ამბავია!',
            en: 'The Moon formed about 4.5 billion years ago, most of the lava seas formed more than 3 billion years ago, Apollo 11 landed in 1969 — and your sample is today’s news!',
          },
        },
      ],
    },
  ],
};
