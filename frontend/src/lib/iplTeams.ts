export interface IPLTeamJersey {
  code: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  helmetColor: string;
  jerseyPattern: number;
}

export const IPL_TEAMS: IPLTeamJersey[] = [
  {
    code: "CSK",
    name: "Chennai Super Kings",
    shortName: "CSK",
    primaryColor: "#F9CD05",
    secondaryColor: "#0081E9",
    helmetColor: "#F9CD05",
    jerseyPattern: 1,
  },
  {
    code: "MI",
    name: "Mumbai Indians",
    shortName: "MI",
    primaryColor: "#004BA0",
    secondaryColor: "#D4AF37",
    helmetColor: "#004BA0",
    jerseyPattern: 2,
  },
  {
    code: "RCB",
    name: "Royal Challengers Bengaluru",
    shortName: "RCB",
    primaryColor: "#EC1C24",
    secondaryColor: "#2B2A29",
    helmetColor: "#2B2A29",
    jerseyPattern: 3,
  },
  {
    code: "KKR",
    name: "Kolkata Knight Riders",
    shortName: "KKR",
    primaryColor: "#3A225D",
    secondaryColor: "#F2C94C",
    helmetColor: "#3A225D",
    jerseyPattern: 1,
  },
  {
    code: "DC",
    name: "Delhi Capitals",
    shortName: "DC",
    primaryColor: "#0078BC",
    secondaryColor: "#EF1B23",
    helmetColor: "#0078BC",
    jerseyPattern: 3,
  },
  {
    code: "PBKS",
    name: "Punjab Kings",
    shortName: "PBKS",
    primaryColor: "#ED1B24",
    secondaryColor: "#A7A9AC",
    helmetColor: "#ED1B24",
    jerseyPattern: 2,
  },
  {
    code: "RR",
    name: "Rajasthan Royals",
    shortName: "RR",
    primaryColor: "#EA1A85",
    secondaryColor: "#254AA5",
    helmetColor: "#254AA5",
    jerseyPattern: 2,
  },
  {
    code: "SRH",
    name: "Sunrisers Hyderabad",
    shortName: "SRH",
    primaryColor: "#F26522",
    secondaryColor: "#1C1C1C",
    helmetColor: "#1C1C1C",
    jerseyPattern: 1,
  },
  {
    code: "GT",
    name: "Gujarat Titans",
    shortName: "GT",
    primaryColor: "#1B2133",
    secondaryColor: "#A0D2DB",
    helmetColor: "#1B2133",
    jerseyPattern: 3,
  },
  {
    code: "LSG",
    name: "Lucknow Super Giants",
    shortName: "LSG",
    primaryColor: "#A72056",
    secondaryColor: "#FFCC00",
    helmetColor: "#A72056",
    jerseyPattern: 1,
  },
];

export function getTeamByCode(code: string): IPLTeamJersey | undefined {
  return IPL_TEAMS.find((t) => t.code === code);
}
