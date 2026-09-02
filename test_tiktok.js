async function test() {
    try {
        const url = 'https://vt.tiktok.com/ZSVEVetwd/';
        const response = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch(e) {
        console.error(e);
    }
}
test();
