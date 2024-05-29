const ACTION_IGNORE = 10000001;
const ACTION_LEFTRIGHT = 10000002;
const ACTION_UPDOWN = 10000003;

var t = 0;
const chart_element = document.getElementById('myChart');
const ctx = document.getElementById('myChart').getContext('2d');
var debug_element = document.getElementById('debug');
var debug2_element = document.getElementById('debug2');

// Generate sample data
const totalDataPoints = 500000;
const window_min = 5; // 这里不想做限制，让用户自由缩放，但是为了防止程序出现问题，设一个最小值
const window_max = 1200; // 最多可以显示的点的数量，放大时减少数量，缩小时提高level，
_ = 0                    // 除非在最小级（没有更详细的数据），实际的现实量不可以小于这个的一半,
_ = 0                    // 暂定：初始情况为最小级，但是 window 大小为 3/4
let viewWindow = 900; // 实际渲染时使用的数据点的数量
let fake_window_size = 900; // 假设在不缩放的情况下，窗口内数据点的数量
const origin_window_size = 900; // 原始窗口大小, 需要通过这个和 ratio 计算 fake_window_size
let currentIndex = 0;
/* 每次更新先更新 fake_window_size (ratio只是用于内部计算的，这里不做讨论)
   1. 如果 fake_window_size 小于 window_max (大于 window_min)，level设成0，结束, viewWindow设为 fake_window_size
   2. 如果 fake_window_size 大于 window_max, 每次除以2, level加1，直到小于等于 window_max 
      (这里对等于的情况不做过多限制, 只要小于等于window_max、大于等于它的一半就行), 最后把值赋给 viewWindow
   3. 渲染时按照 2^level 作为步长选取数据点, 共有 viewWindow 个数据点
 */
let level = 0; // 缩放级别，必须大于等于0，代表从 2^level 个数据点中选一个显示
let ratio = 1.0;
var mouseX = 0;

document.addEventListener('mousemove', function (event) {
    mouseX = event.clientX;
});

window.addEventListener('wheel', function (event) {
    mouseX = event.clientX;
});

document.querySelector('body').style.display = 'none';

var data;
var global_max = Number.MIN_VALUE;
var global_min = Number.MAX_VALUE;
var fix_y = false; // 固定为 global 的范围
var fit_y_current = false; // 每次之前设为 true, 结束之后就设为 false
var lock_y = false; // 这个为 true 的情况下, fix_y 应设成 false, 并把另两个按钮锁定
var current_max = Number.MIN_VALUE;
var current_min = Number.MAX_VALUE;
var prev_y_max = null;
var prev_y_min = null;

const numWorkers = 10;
const workers = [];
const dataSets = new Array(numWorkers).fill(null);
let completedWorkers = 0;
var all_finished = false;
var generating_start_time = performance.now();

// 创建一个函数来使用 Promise 等待所有 Worker 完成任务
function createData() {
    return new Promise((resolve) => {
        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker('data_worker.js');
            worker.onmessage = function (e) {
                const { index, data } = e.data;
                dataSets[index] = data;
                completedWorkers++;
                if (completedWorkers === numWorkers) {
                    resolve(dataSets);
                }
            };
            workers.push(worker);
        }

        workers.forEach((worker, index) => {
            worker.postMessage({ totalDataPoints: totalDataPoints, seed: index });
        });
    });
}

var find_global_min_max = (data) => {
    for (var i = 0; i < data.length; i++) {
        var current = data[i].data;
        var l = current.length;
        for (var j = 0; j < l; j++) {
            if (current[j] > global_max) {
                global_max = current[j];
            }
            if (current[j] < global_min) {
                global_min = current[j];
            }
        }
    }
};

var update_range = () => {
    /* 如果在之前的范围内, 且差小于之前差的 40%, 就不更新
       每次更新, 把 max 上调 1/3, min 下调 1/3
       如果 max大于global_max 或 min小于global_min, 就使用 global_max 或 global_min
     */
    if(lock_y){
        return;
    }
    if(fit_y_current){
        diff = current_max - current_min;
        prev_y_max = current_max + diff * 0.02;
        prev_y_min = current_min - diff * 0.02;
        return;
    }
    if (prev_y_max === null || prev_y_min === null) {
        var diff = current_max - current_min;
        prev_y_max = current_max + diff / 3;
        prev_y_min = current_min - diff / 3;
        if (prev_y_max > global_max) {
            prev_y_max = global_max;
        }
        if (prev_y_min < global_min) {
            prev_y_min = global_min;
        }
        return;
    }
    if (current_min >= prev_y_min && current_max <= prev_y_max && (current_max - current_min) >= 0.4 * (prev_y_max - prev_y_min)) {
        return;
    }
    var diff = current_max - current_min;
    prev_y_max = current_max + diff / 3;
    prev_y_min = current_min - diff / 3;
    if (prev_y_max > global_max) {
        prev_y_max = global_max;
    }
    if (prev_y_min < global_min) {
        prev_y_min = global_min;
    }
};

var get_y_min = () => {
    if (fix_y) {
        return global_min;
    }
    update_range();
    return prev_y_min;
}

var get_y_max = () => {
    if (fix_y) {
        return global_max;
    }
    return prev_y_max;
}

createData().then((dataSets) => {
    data = {
        labels: Array.from({ length: totalDataPoints }, (_, i) => i),
        datasets: dataSets.map((data, i) => ({
            label: `Variable ${i + 1}`,
            data: data
        }))
    };
    find_global_min_max(data.datasets);
    // console.log(`Global max: ${global_max}, Global min: ${global_min}`);
    all_finished = true;
    console.log(`Time to generate data: ${performance.now() - generating_start_time} ms`);
    document.querySelector('body').style.display = 'block';
    updateChart();
    element.addEventListener('wheel', handle_wheel, { passive: false });
    window.addEventListener('resize', updateChart);
});

let myChart;
var fps_datas = [];
var last_update_time = 0;

function slice_no_min_max(arr, start, end_plus_one, step) {
    var result = [];
    var origin_end_plus_one = end_plus_one;
    if (end_plus_one > arr.length) {
        end_plus_one = arr.length;
    }
    if (start >= 0) {
        result.push(arr[start]);
    } else {
        result.push(arr[0]);
    }
    for (var i = start + step; i < end_plus_one; i += step) {
        result.push(arr[i]);
    }
    var ideal_length = Math.floor((origin_end_plus_one - 1 - start) / step) + 1;
    if (result.length < ideal_length) {
        result.push(arr[arr.length - 1]);
    }
    return result;
}

function slice(arr, start, end_plus_one, step) {
    var result = [];
    var origin_end_plus_one = end_plus_one;
    if (end_plus_one > arr.length) {
        end_plus_one = arr.length;
    }
    if (start >= 0) {
        result.push(arr[start]);
        if (arr[start] > current_max) {
            current_max = arr[start];
        }
        if (arr[start] < current_min) {
            current_min = arr[start];
        }
    } else {
        result.push(arr[0]);
        if (arr[0] > current_max) {
            current_max = arr[0];
        }
        if (arr[0] < current_min) {
            current_min = arr[0];
        }
    }
    for (var i = start + step; i < end_plus_one; i += step) {
        result.push(arr[i]);
        if (arr[i] > current_max) {
            current_max = arr[i];
        }
        if (arr[i] < current_min) {
            current_min = arr[i];
        }
    }
    var ideal_length = Math.floor((origin_end_plus_one - 1 - start) / step) + 1;
    if (result.length < ideal_length) {
        result.push(arr[arr.length - 1]);
        if (arr[arr.length - 1] > current_max) {
            current_max = arr[arr.length - 1];
        }
        if (arr[arr.length - 1] < current_min) {
            current_min = arr[arr.length - 1];
        }
    }
    return result;
}

var fix_down_with_remainder = (num, multiple, remainder) => {
    var tmp = num % multiple;
    if (tmp >= remainder) {
        return Math.round(num - tmp + remainder);
    }
    return Math.round(num - tmp - multiple + remainder);
};

var fix_up_with_remainder = (num, multiple, remainder) => {
    var tmp = num % multiple;
    if (tmp <= remainder) {
        return Math.round(num - tmp + remainder);
    }
    return Math.round(num - tmp + multiple + remainder);
};


function createChart() {
    debug2_element.innerHTML = `currentIndex: ${currentIndex.toFixed(6)}<br>fake_window_size: ${fake_window_size.toFixed(6)}<br>viewWindow: ${viewWindow.toFixed(6)}<br>level: ${level}<br>ratio: ${ratio.toFixed(6)}`;
    var step = Math.pow(2, level);
    var remainder = 0;
    if (level !== 0) {
        remainder = Math.pow(2, level - 1);
    }
    var start = fix_down_with_remainder(currentIndex, step, remainder);
    var end_plus_one = fix_up_with_remainder(currentIndex + fake_window_size, step, remainder) + 1;
    current_min = Number.MAX_VALUE;
    current_max = Number.MIN_VALUE;
    const config = {
        type: 'line',
        data: {
            labels: slice_no_min_max(data.labels, start, end_plus_one, step),
            datasets: data.datasets.map(dataset => ({
                ...dataset,
                data: slice(dataset.data, start, end_plus_one, step),
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
                    max: (currentIndex + fake_window_size),
                    display: false
                },
                y: {
                    display: false,
                    // 设置 y
                    min: get_y_min(),
                    max: get_y_max()
                }
            },
            interaction: {
                mode: null  // 禁用鼠标悬停显示数据点信息
            }
        }
    };
    fit_y_current = false;
    var chart_y_min = config.options.scales.y.min;
    var chart_y_max = config.options.scales.y.max;
    // console.log(`Current max: ${current_max}, Current min: ${current_min}`);
    // document.getElementById('y-top-value').innerHTML = chart_y_max.toFixed(2);
    // document.getElementById('y-bottom-value').innerHTML = chart_y_min.toFixed(2);
    set_y_value(chart_y_min, chart_y_max);
    return new Chart(ctx, config);
}


// Function to update the chart view window by recreating the chart
function updateChart() {
    // var t1 = performance.now();
    if (myChart) {
        myChart.destroy();
    }
    myChart = createChart();
    var time = performance.now() - t;
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
        return;
    }
    if (action === ACTION_LEFTRIGHT) {
        currentIndex += x * fake_window_size / 1000;
        if (currentIndex < 0) {
            currentIndex = 0;
        }
        if (currentIndex > totalDataPoints - fake_window_size - 1) {
            currentIndex = totalDataPoints - fake_window_size - 1;
        }
    }
    if (action === ACTION_UPDOWN) {
        ratio *= Math.pow(1.01, y);
        var prev_fake_window_size = fake_window_size;
        fake_window_size = origin_window_size * ratio;
        if (fake_window_size < window_min) {
            fake_window_size = window_min;
            ratio = fake_window_size / origin_window_size;
        }
        if (fake_window_size > totalDataPoints - 1) {
            fake_window_size = totalDataPoints - 1;
            ratio = fake_window_size / origin_window_size;
        }
        var mouse_x = getMousePosition();
        var left_ratio = (mouse_x - currentIndex) / prev_fake_window_size;
        currentIndex = mouse_x - fake_window_size * left_ratio;
        if (currentIndex < 0) {
            currentIndex = 0;
        }
        if (currentIndex > totalDataPoints - fake_window_size - 1) {
            currentIndex = totalDataPoints - fake_window_size - 1;
        }
        // 开始处理 level 和 viewWindow, 因为实际上前面只是计算范围, 
        // 和实际渲染完全没关系, currentIndex 可以先计算好
        level = 0;
        viewWindow = fake_window_size;
        while (viewWindow > window_max) {
            viewWindow /= 2;
            level++;
        }
    }
    debug_element.innerHTML = `currentIndex: ${currentIndex.toFixed(6)}<br>fake_window_size: ${fake_window_size.toFixed(6)}<br>viewWindow: ${viewWindow.toFixed(6)}<br>level: ${level}<br>ratio: ${ratio.toFixed(6)}`;
    updateChart();
}

var element = document.getElementById('myChart');

function getMousePosition() {
    const canvas = document.getElementById('myChart');
    const rect = canvas.getBoundingClientRect();
    const mouse_X = mouseX - rect.left;
    const xValue = myChart.scales.x.getValueForPixel(mouse_X);
    // console.log(xValue);
    return xValue;
}

var fix_y_checkbox = document.getElementById('fix-y');
var fix_y_wrapper = document.getElementById('fix-y-wrapper');
var fix_y_mask_element = document.getElementById('fix-y-mask');
fix_y_checkbox.addEventListener('change', () => {
    if(lock_y){
        if(fix_y_checkbox.checked){
            fix_y_checkbox.checked = false;
        }
        return;
    }
    if (fix_y_checkbox.checked) {
        fit_y_element.classList.add('invalid');
        fix_y = true;
    } else {
        fit_y_element.classList.remove('invalid');
        fix_y = false;
    }
    updateChart();
});

var fit_y_element = document.getElementById('to-current');
var fit_current = () => {
    if (lock_y || fix_y) {
        return;
    }
    fit_y_current = true;
    updateChart();
};

var lock_y_checkbox = document.getElementById('lock-y');
lock_y_checkbox.addEventListener('change', () => {
    if (lock_y_checkbox.checked) {
        if(fix_y){
            prev_y_max = global_max;
            prev_y_min = global_min;
        }
        lock_y = true;
        fix_y_checkbox.checked = false;
        fix_y = false;
        fit_y_element.classList.add('invalid');
        fix_y_wrapper.classList.add('invalid');
        fix_y_checkbox.classList.add('invalid');
        fix_y_mask_element.style.display = 'block';
    } else {
        lock_y = false;
        fit_y_element.classList.remove('invalid');
        fix_y_wrapper.classList.remove('invalid');
        fix_y_checkbox.classList.remove('invalid');
        fix_y_mask_element.style.display = 'none';
    }
    // updateChart();
});