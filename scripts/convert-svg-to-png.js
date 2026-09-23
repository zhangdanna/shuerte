const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const tabbarDir = path.join(__dirname, '..', 'src', 'assets', 'tabbar');

async function convertAll() {
  const files = fs.readdirSync(tabbarDir).filter(f => f.endsWith('.svg'));
  
  for (const svgFile of files) {
    const svgPath = path.join(tabbarDir, svgFile);
    const pngFile = svgFile.replace('.svg', '.png');
    const pngPath = path.join(tabbarDir, pngFile);
    
    console.log(`Converting ${svgFile} -> ${pngFile}`);
    await sharp(svgPath)
      .resize(81, 81) // tabBar 图标推荐尺寸
      .png()
      .toFile(pngPath);
  }
  
  console.log(`\nDone! Converted ${files.length} files.`);
}

convertAll().catch(err => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
