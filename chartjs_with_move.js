const ACTION_IGNORE = 10000001;
const ACTION_LEFTRIGHT = 10000002;
const ACTION_UPDOWN = 10000003;

var t = 0;
const chart_element = document.getElementById('myChart');
const ctx = document.getElementById('myChart').getContext('2d');

// Generate sample data
const totalDataPoints = 20000000;
const origin_viewWindow = 800;
let viewWindow = 800; // Number of data points to show in view window
let currentIndex = 0;
let ratio = 1.0;
var mouseX = 0;

document.addEventListener('mousemove', function (event) {
    mouseX = event.clientX;
});

window.addEventListener('wheel', function (event) {
    mouseX = event.clientX;
});

// var data;

function generateDataSequence(length) {
    const data = [];
    let currentValue = Math.random() * 100 - 50; // 生成第一个数，范围在-50到50之间
    data.push(currentValue);

    for (let i = 1; i < length; i++) {
        const randomChange = Math.random() * 5 - 2.5; // 生成-1到1之间的随机浮点数
        currentValue += randomChange;
        data.push(currentValue);
    }

    return data;
}

const S0 = 100; // 初始价格
const mu = 0.0002; // 期望收益率
const sigma = 0.01; // 波动率
const dt = 1 / 252; // 时间步长，假设一年有252个交易日
var start_time = performance.now();
// const seedrandom = require('seedrandom');

function generateDataSequence(length, seed) {
    const myrng = new Math.seedrandom(`jtc${seed}`);
    const data = [];
    let currentValue = S0; // 初始价格
    data.push(currentValue);

    for (let i = 1; i < length; i++) {
        // const randomShock = Math.random() * 2 - 1; // -1 到 1 的随机数
        const randomShock = myrng() * 2 - 1; // -1 到 1 的随机数
        const drift = (mu - 0.5 * sigma * sigma) * dt;
        const diffusion = sigma * randomShock * Math.sqrt(dt);
        currentValue = currentValue * Math.exp(drift + diffusion);
        data.push(currentValue);
    }

    return data;
}

const data = {
    labels: Array.from({ length: totalDataPoints }, (_, i) => i),
    datasets: Array.from({ length: 10 }, (_, i) => ({
        label: `Variable ${i + 1}`,
        // data: Array.from({ length: totalDataPoints }, () => Math.random() * 100),
        data: generateDataSequence(totalDataPoints, i),
        // 这样就可以实现自定义颜色，但是因为随机生成的太难看，还是用它默认的
        // borderColor: `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`
    }))
};
console.log(`Data generation time: ${performance.now() - start_time} ms`);

let myChart;
var fps_datas = [];
var last_update_time = 0;


function createChart() {
    const config = {
        type: 'line',
        data: {
            labels: data.labels.slice((currentIndex), (currentIndex + viewWindow)),
            datasets: data.datasets.map(dataset => ({
                ...dataset,
                data: dataset.data.slice((currentIndex), (currentIndex + viewWindow)),
                pointRadius: 0,
                borderWidth: chart_element.clientHeight / 300,
                tension: 0,
                borderJoinStyle: 'round'
            }))
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false  // 不显示图例
                },
                tooltip: {
                    enabled: false  // 关闭工具提示
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: (currentIndex),
                    max: (currentIndex + viewWindow - 1),
                    display: false
                },
                y: {
                    // display: false,
                    // 设置 y
                    // min: -5,
                    // max: 105
                }
            },
            interaction: {
                mode: null  // 禁用鼠标悬停显示数据点信息
            }
        }
    };
    return new Chart(ctx, config);
}


// Function to update the chart view window by recreating the chart
function updateChart() {
    // var t1 = performance.now();
    if (myChart) {
        myChart.destroy();
    }
    myChart = createChart();
    // console.log(`${performance.now() - t1} ms`);
    var time = performance.now() - t;
    console.log(`${time} ms`);
    if (time > 500) {
        t = performance.now();
        return;
    }
    fps_datas.push(time);
    if (fps_datas.length > 10) {
        fps_datas.shift();
    }
    if (performance.now() - last_update_time > 150) {
        last_update_time = performance.now();
        var sum = 0;
        for (var i = 0; i < fps_datas.length; i++) {
            sum += fps_datas[i];
        }
        time = sum / fps_datas.length;
        var fps = 1000 / time;
        var e = document.getElementById("fps");
        e.innerHTML = `FPS: ${fps.toFixed(2)}`;
    }
    t = performance.now();
}


function handle_wheel(event) {
    event.preventDefault();
    var y = event.deltaY;
    var x = event.deltaX;
    var action = -1;
    if (y === 0) {
        action = ACTION_LEFTRIGHT;
    } else if (x === 0) {
        action = ACTION_UPDOWN;
    } else if (Math.abs(y) >= 3 * Math.abs(x)) {
        action = ACTION_UPDOWN;
    } else if (Math.abs(x) >= 3 * Math.abs(y)) {
        action = ACTION_LEFTRIGHT;
    } else {
        action = ACTION_IGNORE;
    }
    if (action === ACTION_IGNORE) {
        console.log(`Ignored, x: ${x}, y: ${y}`);
        return;
    }
    if (action === ACTION_LEFTRIGHT) {
        console.log(`Left/Right, x: ${x}, y: ${y}`);
        currentIndex += x * viewWindow / 1000;
        if (currentIndex < 0) {
            currentIndex = 0;
        }
        if (currentIndex > totalDataPoints - viewWindow) {
            currentIndex = totalDataPoints - viewWindow;
        }
    }
    if (action === ACTION_UPDOWN) {
        console.log(`Up/Down, x: ${x}, y: ${y}`);
        ratio *= Math.pow(1.01, y);
        if (ratio >= 1.5) {
            ratio = 1.5;
        }
        if (ratio <= 0.1) {
            ratio = 0.1;
        }
        var mouse_x = getMousePosition();
        var left_ratio = (mouse_x - currentIndex) / viewWindow;
        viewWindow = origin_viewWindow * ratio;
        currentIndex = mouse_x - viewWindow * left_ratio;
        if (currentIndex < 0) {
            currentIndex = 0;
        }
        if (currentIndex > totalDataPoints - viewWindow) {
            currentIndex = totalDataPoints - viewWindow;
        }
    }
    updateChart();
}

var element = document.getElementById('myChart');

element.addEventListener('wheel', handle_wheel, { passive: false });
window.addEventListener('resize', updateChart);

function getMousePosition() {
    const canvas = document.getElementById('myChart');
    const rect = canvas.getBoundingClientRect();
    const mouse_X = mouseX - rect.left;
    const xValue = myChart.scales.x.getValueForPixel(mouse_X);
    // console.log(xValue);
    return xValue;
}

updateChart();

