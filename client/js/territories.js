// 960x540 canvas, polygons defined as [[x,y], ...]
const CONTINENTS = {
    na: { name: "North America", bonus: 5,  color: "#2980b9" },
    sa: { name: "South America", bonus: 2,  color: "#d4ac0d" },
    eu: { name: "Europe",        bonus: 5,  color: "#27ae60" },
    af: { name: "Africa",        bonus: 3,  color: "#e67e22" },
    as: { name: "Asia",          bonus: 7,  color: "#c0392b" },
    au: { name: "Australia",     bonus: 2,  color: "#8e44ad" },
};

const TERRITORIES = {
    // ── North America ──────────────────────────────────────────────────────
    alaska: {
        name: "Alaska", continent: "na",
        center: [47,60],
        points: [[10,25],[80,20],[88,65],[72,100],[10,100]],
        neighbors: ["nw_territory","alberta","kamchatka"]
    },
    nw_territory: {
        name: "N.W. Territory", continent: "na",
        center: [138,62],
        points: [[82,20],[186,15],[193,62],[180,105],[87,105],[90,65]],
        neighbors: ["alaska","alberta","ontario","greenland"]
    },
    greenland: {
        name: "Greenland", continent: "na",
        center: [252,47],
        points: [[202,12],[300,7],[308,55],[280,88],[204,85]],
        neighbors: ["nw_territory","ontario","quebec","iceland"]
    },
    alberta: {
        name: "Alberta", continent: "na",
        center: [96,138],
        points: [[10,100],[180,100],[186,148],[176,180],[12,180]],
        neighbors: ["alaska","nw_territory","ontario","western_us"]
    },
    ontario: {
        name: "Ontario", continent: "na",
        center: [234,118],
        points: [[180,65],[205,65],[286,58],[296,108],[292,168],[182,168],[182,125]],
        neighbors: ["nw_territory","alberta","greenland","quebec","eastern_us","western_us"]
    },
    quebec: {
        name: "Quebec", continent: "na",
        center: [308,108],
        points: [[282,58],[332,52],[337,108],[332,165],[296,160],[296,108]],
        neighbors: ["ontario","greenland","eastern_us"]
    },
    western_us: {
        name: "Western US", continent: "na",
        center: [93,222],
        points: [[12,178],[176,178],[184,232],[174,270],[14,270]],
        neighbors: ["alberta","ontario","eastern_us","central_america"]
    },
    eastern_us: {
        name: "Eastern US", continent: "na",
        center: [253,215],
        points: [[174,168],[334,158],[340,230],[330,272],[178,274],[178,232]],
        neighbors: ["ontario","quebec","western_us","central_america"]
    },
    central_america: {
        name: "Central America", continent: "na",
        center: [95,292],
        points: [[14,268],[174,272],[180,308],[148,325],[14,320]],
        neighbors: ["western_us","eastern_us","venezuela"]
    },

    // ── South America ──────────────────────────────────────────────────────
    venezuela: {
        name: "Venezuela", continent: "sa",
        center: [151,340],
        points: [[100,310],[200,308],[206,352],[190,378],[104,375]],
        neighbors: ["central_america","brazil","peru"]
    },
    peru: {
        name: "Peru", continent: "sa",
        center: [55,402],
        points: [[10,370],[104,370],[112,414],[102,440],[12,442]],
        neighbors: ["venezuela","brazil","argentina"]
    },
    brazil: {
        name: "Brazil", continent: "sa",
        center: [228,372],
        points: [[175,308],[310,302],[317,385],[300,435],[176,438],[170,385]],
        neighbors: ["venezuela","peru","argentina","n_africa"]
    },
    argentina: {
        name: "Argentina", continent: "sa",
        center: [160,468],
        points: [[12,442],[300,435],[305,478],[202,505],[12,505]],
        neighbors: ["peru","brazil"]
    },

    // ── Europe ─────────────────────────────────────────────────────────────
    iceland: {
        name: "Iceland", continent: "eu",
        center: [347,43],
        points: [[318,14],[374,9],[380,56],[355,84],[320,79]],
        neighbors: ["greenland","great_britain","n_europe"]
    },
    great_britain: {
        name: "Great Britain", continent: "eu",
        center: [343,112],
        points: [[315,82],[370,79],[376,128],[355,154],[316,150]],
        neighbors: ["iceland","n_europe","w_europe"]
    },
    n_europe: {
        name: "N. Europe", continent: "eu",
        center: [421,72],
        points: [[374,10],[470,8],[476,76],[464,123],[380,120],[376,70]],
        neighbors: ["iceland","great_britain","w_europe","s_europe","ukraine"]
    },
    w_europe: {
        name: "W. Europe", continent: "eu",
        center: [408,182],
        points: [[348,143],[466,128],[472,188],[460,220],[354,224]],
        neighbors: ["great_britain","n_europe","s_europe","n_africa"]
    },
    s_europe: {
        name: "S. Europe", continent: "eu",
        center: [496,158],
        points: [[460,112],[535,108],[540,168],[525,208],[465,204],[465,168]],
        neighbors: ["n_europe","w_europe","e_europe","ukraine","n_africa","egypt","middle_east"]
    },
    e_europe: {
        name: "E. Europe", continent: "eu",
        center: [507,68],
        points: [[465,12],[550,8],[556,114],[538,124],[470,118],[468,52]],
        neighbors: ["n_europe","s_europe","ukraine","ural","afghanistan","middle_east"]
    },
    ukraine: {
        name: "Ukraine", continent: "eu",
        center: [580,58],
        points: [[540,10],[620,5],[626,114],[556,124],[552,64]],
        neighbors: ["n_europe","s_europe","e_europe","ural","afghanistan","middle_east"]
    },

    // ── Africa ─────────────────────────────────────────────────────────────
    n_africa: {
        name: "N. Africa", continent: "af",
        center: [415,260],
        points: [[314,220],[540,215],[546,284],[524,305],[320,305]],
        neighbors: ["brazil","w_europe","s_europe","egypt","e_africa","congo"]
    },
    egypt: {
        name: "Egypt", continent: "af",
        center: [565,250],
        points: [[530,208],[601,204],[607,274],[585,300],[536,288]],
        neighbors: ["s_europe","n_africa","e_africa","middle_east"]
    },
    congo: {
        name: "Congo", continent: "af",
        center: [415,342],
        points: [[320,300],[524,300],[530,368],[514,394],[322,394]],
        neighbors: ["n_africa","e_africa","s_africa"]
    },
    e_africa: {
        name: "E. Africa", continent: "af",
        center: [559,335],
        points: [[515,294],[602,290],[608,368],[586,395],[520,384]],
        neighbors: ["egypt","n_africa","congo","s_africa","madagascar","middle_east"]
    },
    s_africa: {
        name: "S. Africa", continent: "af",
        center: [415,432],
        points: [[320,390],[514,390],[520,458],[450,485],[320,458]],
        neighbors: ["congo","e_africa","madagascar"]
    },
    madagascar: {
        name: "Madagascar", continent: "af",
        center: [572,432],
        points: [[555,398],[605,394],[610,464],[580,488],[552,462]],
        neighbors: ["s_africa","e_africa"]
    },

    // ── Asia ───────────────────────────────────────────────────────────────
    ural: {
        name: "Ural", continent: "as",
        center: [668,52],
        points: [[615,18],[718,14],[724,68],[714,84],[620,78]],
        neighbors: ["ukraine","e_europe","siberia","afghanistan","china"]
    },
    siberia: {
        name: "Siberia", continent: "as",
        center: [706,22],
        points: [[620,4],[795,2],[800,44],[786,64],[626,60]],
        neighbors: ["ural","yakutsk","irkutsk","mongolia","china"]
    },
    yakutsk: {
        name: "Yakutsk", continent: "as",
        center: [842,28],
        points: [[788,4],[888,2],[894,54],[882,68],[792,64]],
        neighbors: ["siberia","irkutsk","kamchatka"]
    },
    kamchatka: {
        name: "Kamchatka", continent: "as",
        center: [917,42],
        points: [[884,4],[955,2],[958,74],[894,79],[888,34]],
        neighbors: ["yakutsk","irkutsk","mongolia","japan","alaska"]
    },
    irkutsk: {
        name: "Irkutsk", continent: "as",
        center: [840,92],
        points: [[790,62],[884,58],[890,114],[874,142],[796,145]],
        neighbors: ["siberia","yakutsk","kamchatka","mongolia"]
    },
    mongolia: {
        name: "Mongolia", continent: "as",
        center: [838,155],
        points: [[792,140],[876,138],[882,198],[866,222],[796,218]],
        neighbors: ["irkutsk","siberia","kamchatka","china","japan"]
    },
    japan: {
        name: "Japan", continent: "as",
        center: [921,130],
        points: [[904,80],[956,76],[960,148],[926,162],[902,148]],
        neighbors: ["kamchatka","mongolia"]
    },
    afghanistan: {
        name: "Afghanistan", continent: "as",
        center: [665,118],
        points: [[614,78],[718,74],[724,130],[708,150],[620,145]],
        neighbors: ["ukraine","e_europe","ural","china","india","middle_east"]
    },
    china: {
        name: "China", continent: "as",
        center: [790,155],
        points: [[706,82],[793,78],[796,132],[882,132],[886,198],[868,222],[714,218],[708,158]],
        neighbors: ["ural","siberia","mongolia","afghanistan","india","siam"]
    },
    middle_east: {
        name: "Middle East", continent: "as",
        center: [625,190],
        points: [[580,120],[665,115],[670,200],[650,250],[585,244]],
        neighbors: ["ukraine","e_europe","s_europe","egypt","e_africa","afghanistan","india"]
    },
    india: {
        name: "India", continent: "as",
        center: [695,242],
        points: [[650,148],[730,144],[736,228],[716,315],[656,320],[645,270]],
        neighbors: ["middle_east","afghanistan","china","siam"]
    },
    siam: {
        name: "Siam", continent: "as",
        center: [776,265],
        points: [[716,215],[820,210],[826,280],[796,310],[720,316]],
        neighbors: ["india","china","indonesia"]
    },

    // ── Australia ──────────────────────────────────────────────────────────
    indonesia: {
        name: "Indonesia", continent: "au",
        center: [773,360],
        points: [[722,315],[823,310],[828,375],[800,400],[725,398]],
        neighbors: ["siam","new_guinea","w_australia"]
    },
    new_guinea: {
        name: "New Guinea", continent: "au",
        center: [864,338],
        points: [[824,308],[906,302],[912,364],[890,390],[828,380]],
        neighbors: ["indonesia","w_australia","e_australia"]
    },
    w_australia: {
        name: "W. Australia", continent: "au",
        center: [775,444],
        points: [[724,396],[826,393],[832,465],[780,495],[725,485]],
        neighbors: ["indonesia","new_guinea","e_australia"]
    },
    e_australia: {
        name: "E. Australia", continent: "au",
        center: [870,446],
        points: [[828,386],[912,382],[918,480],[835,505],[830,464],[826,475]],
        neighbors: ["new_guinea","w_australia"]
    },
};
