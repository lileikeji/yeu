import { officialCampusPlanReference } from './official-campus-plan-reference'

export interface OfficialCampusPlanAnchor {
  mapNumber: string
  x: number
  y: number
}

export const OFFICIAL_CAMPUS_PLAN_WIDTH = officialCampusPlanReference.imageWidth
export const OFFICIAL_CAMPUS_PLAN_HEIGHT = officialCampusPlanReference.imageHeight

/** Image-relative hotspots from the university's 8504x3898 campus diagram; never geographic coordinates. */
export const officialCampusPlanAnchors: OfficialCampusPlanAnchor[] = [
  { mapNumber: '01', x: 9.243, y: 30.118 },
  { mapNumber: '02', x: 13.076, y: 27.142 },
  { mapNumber: '02', x: 15.710, y: 33.350 },
  { mapNumber: '02', x: 12.488, y: 68.753 },
  { mapNumber: '03', x: 12.488, y: 49.359 },
  { mapNumber: '04', x: 18.697, y: 38.225 },
  { mapNumber: '05', x: 21.002, y: 36.685 },
  { mapNumber: '06', x: 25.494, y: 36.378 },
  { mapNumber: '07', x: 26.058, y: 54.028 },
  { mapNumber: '07', x: 57.126, y: 61.160 },
  { mapNumber: '07', x: 67.615, y: 84.505 },
  { mapNumber: '08', x: 25.659, y: 65.008 },
  { mapNumber: '09', x: 29.657, y: 59.928 },
  { mapNumber: '10', x: 33.184, y: 51.154 },
  { mapNumber: '11', x: 35.677, y: 41.098 },
  { mapNumber: '11', x: 77.399, y: 67.881 },
  { mapNumber: '12', x: 43.062, y: 42.945 },
  { mapNumber: '13', x: 37.865, y: 51.873 },
  { mapNumber: '14', x: 43.627, y: 54.336 },
  { mapNumber: '15', x: 43.250, y: 60.698 },
  { mapNumber: '16', x: 45.179, y: 63.828 },
  { mapNumber: '17', x: 41.604, y: 66.342 },
  { mapNumber: '18', x: 54.233, y: 61.775 },
  { mapNumber: '19', x: 55.903, y: 66.855 },
  { mapNumber: '20', x: 59.243, y: 57.158 },
  { mapNumber: '21', x: 60.089, y: 60.390 },
  { mapNumber: '22', x: 60.207, y: 63.982 },
  { mapNumber: '23', x: 60.442, y: 66.752 },
  { mapNumber: '24', x: 59.102, y: 68.548 },
  { mapNumber: '25', x: 58.020, y: 70.395 },
  { mapNumber: '26', x: 59.784, y: 71.062 },
  { mapNumber: '27', x: 57.361, y: 72.807 },
  { mapNumber: '28', x: 62.723, y: 69.369 },
  { mapNumber: '29', x: 62.394, y: 66.701 },
  { mapNumber: '30', x: 61.453, y: 64.905 },
  { mapNumber: '31', x: 66.863, y: 61.416 },
  { mapNumber: '32', x: 65.569, y: 67.624 },
  { mapNumber: '33', x: 63.547, y: 75.936 },
  { mapNumber: '34', x: 72.484, y: 63.674 },
  { mapNumber: '34', x: 76.834, y: 72.140 },
  { mapNumber: '34', x: 61.571, y: 85.788 },
  { mapNumber: '35', x: 68.603, y: 67.881 },
  { mapNumber: '36', x: 71.919, y: 67.881 },
  { mapNumber: '37', x: 74.835, y: 68.753 },
  { mapNumber: '38', x: 70.602, y: 70.959 },
  { mapNumber: '39', x: 68.368, y: 74.448 },
  { mapNumber: '40', x: 77.987, y: 80.452 },
  { mapNumber: '41', x: 50.282, y: 71.780 },
  { mapNumber: '42', x: 59.713, y: 75.013 },
  { mapNumber: '43', x: 79.468, y: 71.780 },
  { mapNumber: '44', x: 22.648, y: 34.274 },
  { mapNumber: '45', x: 26.552, y: 31.657 },
  { mapNumber: '46', x: 42.968, y: 32.478 },
  { mapNumber: '47', x: 50.541, y: 66.290 }
]
