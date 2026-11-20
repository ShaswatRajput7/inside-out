export const SHADOW_KEY = 'inside-out:shadow-mode'
const words = `acorn apple apron arrow attic autumn baby badge bag baker balloon bamboo banana basket beach bean bear beard bell berry bicycle bird blanket boat book bottle bowl branch bread breeze brick bridge broom brush bucket butter button cabin cactus cake camera candle canvas carpet carrot castle cat cave cedar chair cherry chest chicken chimney circle clock cloud clover coat coconut coffee coin compass cookie copper corn cotton couch crab crane creek crown cup curtain daisy deer desert desk diamond dish dog dolphin door dragon drawer dream dress drum duck eagle earth egg elbow elephant engine feather fence fern field fire fish flag flame flower flute forest fork fountain fox frame frog frost fruit garden gate gem ghost gift glass globe glove goat gold goose grape grass gravel green guitar hair hammer harbor hat hawk hay heart hedge hill honey horse house ice island jacket jar jelly jewel kettle key kite kitten ladder lake lamp lantern leaf lemon letter library lily lime lion loaf lobster lock log maple marble meadow melon milk mint mirror moon moss mountain mouse mug mushroom nail nest net night notebook oak ocean olive onion orange orchard otter owl oyster paddle paint palace palm panda paper park parrot peach peanut pear pebble pencil pepper petal piano pickle pigeon pillow pine planet plate plum pocket pond pony potato pumpkin puppy rabbit rain rainbow rake raven ribbon rice river road robin robot rock roof root rope rose rug saddle sail salad salmon salt sand scarf school sea seal seed shadow shark sheep shelf shell ship shoe shore shovel silk silver sky sled slipper snail snow soap sock sofa soil soup sparrow spoon spring squirrel star steam stick stone stool store storm stove straw stream string sugar summer sun sunset swan sweater table tail tea tent thorn thread tiger tile toast tomato tooth towel tower toy train tray tree trumpet tulip turtle umbrella valley vase velvet village violin wagon wall walnut water wave wax whale wheat wheel willow wind window wing winter wolf wood wool yard yellow yogurt zebra zipper`.split(' ')

// Preserve whitespace and choose ordinary words of similar length, without carrying
// punctuation, emoji, URLs or any other original content into the disguised text.
export function maskText(text, random = Math.random) {
  const original = new Set(text.toLowerCase().match(/[a-z]+/g) || [])
  return text.replace(/\S+/gu, (token) => {
    const length = [...token].length
    const candidates = words.filter((word) => !original.has(word) && Math.abs(word.length - Math.min(length, 10)) <= 2)
    const pool = candidates.length ? candidates : words.filter((word) => !original.has(word))
    const choose = () => (pool.length ? pool : words)[Math.floor(random() * (pool.length || words.length))]
    if (length <= 12) return choose()
    const result = []
    let size = 0
    while (size < length) { const word = choose(); result.push(word); size += word.length + 1 }
    return result.join(' ')
  })
}
export function shadowEnabled() {
  try { return localStorage.getItem(SHADOW_KEY) === 'true' } catch { return false }
}
