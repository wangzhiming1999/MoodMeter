window.onload = () => {
  let model = "";
  let faceModel = "";
  let allData = [];
  let allFaceData = {};
  let chartArr = [];
  // 统计坐标点
  let dataArr = {};
  let count = 0;
  const video = document.getElementById("video");
  const myChart3 = echarts.init(document.querySelector(".myChart3"));
  const SIZE = 48;
  const IMAGENET_CLASSES = ["Surprise", "Neutral", "Anger", "Happy", "Sad"];
  let timer = 0;
  const canvas = document.querySelector("#canvas");
  // const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  // 按钮事件绑定
  const startButton = document.querySelector(".startButton");
  const endButton = document.querySelector(".endButton");
  const uploadButton = document.querySelector(".uploadButton");
  const useLocalButton = document.querySelector(".localButton");
  const linkVideo = document.querySelector(".linkVideo");
  video.addEventListener("play", () => {
    console.log("开始识别");
    initChart();
    updateChart([0, 0]);
    startVideo();
  });
  video.addEventListener(
    "ended",
    () => {
      //结束
      endVideo();
    },
    false
  );
  video.addEventListener(
    "pause",
    () => {
      //结束
      endVideo();
    },
    false
  );
  video.addEventListener("error", function (event) {
    if (event.target.error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      alert("The video source is not supported.");
    } else {
      alert("An unknown error occurred.");
    }
  });

  endButton.addEventListener("click", () => {
    endVideo();
  });
  uploadButton.addEventListener("change", (e) => {
    const file = e.target.files[0];
    const reader = new FileReader(); // 创建FileReader对象(文件对象)
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      // 读取成功时：
      video.src = e.target.result;
    };
  });
  useLocalButton.addEventListener("click", () => {
    useLocalStream();
  });
  // 视频链接
  linkVideo.addEventListener("change", (e) => {
    clearInterval(timer);
    const url = e.target.value;
    if (url.includes("https://www.youtube.com/watch")) {
      axios({
        method: "post",
        url: `http://193.111.31.218:2082/tube/get_media_real_url?media_url=${url}`,
      })
        .then((res) => {
          const real_url = res.data.body.proxy_url;
          if (real_url) {
            video.src = real_url;
          } else {
            alert("video url not find");
          }
        })
        .catch((error) => {
          alert("request error");
        });
    } else {
      video.src = url;
    }
  });

  // 初始化加载模型
  const init = async () => {
    model = await tf.loadLayersModel("./models/model.json");
    faceModel = await blazeface.load();
    console.info("load models finished.");
    // startVideo();
  };
  init();
  // 开始识别
  const startVideo = () => {
    allData = [];
    allFaceData = {};
    chartArr = [];
    // 统计坐标点
    dataArr = {};
    count = 0;
    clearInterval(timer);
    timer = window.setInterval(() => {
      if (faceModel && video && canvas) {
        detectImage();
      }
    }, 66);
  };
  // 停止识别
  const endVideo = () => {
    if (video.srcObject) {
      video.srcObject = null;
    }
    video.pause();
    clearInterval(timer);
  };

  const disposeData = (item) => {
    // 将数据统计次数 间隔10为一组数据
    const [x, y] = item;
    if (dataArr[parseInt(x)]?.[parseInt(y)]) {
      dataArr[parseInt(x)][parseInt(y)] += 1;
    } else {
      dataArr[parseInt(x).toString()] = {};
      dataArr[parseInt(x).toString()][parseInt(y).toString()] = 1;
    }
  };
  // 使用本地流
  const useLocalStream = () => {
    // 用本地流
    if (navigator.mediaDevices.getUserMedia) {
      //最新的标准API
      navigator.mediaDevices
        .getUserMedia({ video: { width: 1920, height: 1080 } })
        .then(success)
        .catch(error);
    } else if (navigator.webkitGetUserMedia) {
      //webkit核心浏览器
      navigator.webkitGetUserMedia(
        { video: { width: 1920, height: 1080 } },
        success,
        error
      );
    } else if (navigator.mozGetUserMedia) {
      //firfox浏览器
      navigator.mozGetUserMedia(
        { video: { width: 1920, height: 1080 } },
        success,
        error
      );
    } else if (navigator.getUserMedia) {
      //旧版API
      navigator.getUserMedia(
        { video: { width: 1920, height: 1080 } },
        success,
        error
      );
    }
    // 成功后拿到视频流
    function success(stream) {
      //将视频流设置为video元素的源
      video.srcObject = stream;
      video.play();
    }
    function error(error) {
      console.log(`访问用户媒体设备失败${error.name}, ${error.message}`);
    }
  };

  // 识别图片,并在页面展示
  async function detectImage() {
    console.log("识别");
    canvas.width = video.offsetWidth;
    canvas.height = video.offsetHeight;
    const imgWidth = Math.min(
      canvas.width,
      (video.videoWidth * canvas.height) / video.videoHeight
    );
    const imgHeight = Math.min(
      canvas.height,
      (video.videoHeight * canvas.width) / video.videoWidth
    );

    // 准备用于识别的样本
    context.drawImage(
      video,
      0,
      0,
      video.videoWidth,
      video.videoHeight,
      (canvas.width - imgWidth) / 2,
      (canvas.height - imgHeight) / 2,
      imgWidth,
      imgHeight
    );
    // Preprocess the canvas data
    let imageData = context.getImageData(
      (canvas.width - imgWidth) / 2,
      (canvas.height - imgHeight) / 2,
      imgWidth,
      imgHeight
    );

    const returnTensors = false; // Pass in `true` to get tensors back, rather than values.
    drawFaceRect([
      (canvas.width - imgWidth) / 2,
      (canvas.height - imgHeight) / 2,
      imgWidth,
      imgHeight,
    ]);
    let predictions = await faceModel.estimateFaces(imageData, returnTensors);

    if (predictions.length > 0) {
      // get more faces in future
      const start = predictions[0].topLeft;
      const end = predictions[0].bottomRight;
      const center = [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2];
      const size = [end[0] - start[0], end[1] - start[1]];

      const maxSide = Math.max(size[0], size[1]) * 1.3;

      var rect = [
        center[0] - maxSide / 2 + (canvas.width - imgWidth) / 2,
        center[1] - maxSide / 2 + (canvas.height - imgHeight) / 2,
        maxSide,
        maxSide,
      ];

      let face = context.getImageData(rect[0], rect[1], rect[2], rect[3]);
      const tensor = tf.browser.fromPixels(face).toFloat();
      const resized = tf.image.resizeBilinear(tensor, [SIZE, SIZE]);
      const grayscale = resized.mean(2);
      const normalized = grayscale.div(255.0);
      const input = normalized.reshape([1, SIZE, SIZE, 1]);
      const prob = model.predict(input);
      var coordinates = convertProb(prob.arraySync());
      // drawPoint(coordinates);
      drawFaceRect(rect);
      allData.push(coordinates[0]);
      disposeData(coordinates[0]);
      count += 1;
      if (count % 3 == 0) {
        updateChart(coordinates[0]);
      }
      if (count % 10 === 0) {
        initChart();
      }
      const msg = IMAGENET_CLASSES[prob.argMax(1).dataSync()[0]];
      // console.log(msg);
      allFaceData[msg] ? (allFaceData[msg] = 0) : (allFaceData[msg] += 1);
    }

    function drawFaceRect(rect) {
      context.beginPath();
      context.lineWidth = "1";
      context.strokeStyle = "yellow";
      context.rect(rect[0], rect[1], rect[2], rect[3]);
      context.stroke();
    }
    function drawPoint(coordinates) {
      // 绘制散点图
      for (var i = 0; i < coordinates.length; i++) {
        context.fillStyle = "blue";
        context.beginPath();
        context.arc(
          coordinates[i][0] + canvas.width / 2,
          coordinates[i][1] + canvas.height / 2,
          5,
          0,
          2 * Math.PI
        );

        context.stroke();
      }
    }

    // const IMAGENET_CLASSES = ["Surprise", "Neutral", "Anger", "Happy", "Sad"];
    // 18,90，162，234，306
    function convertProb(prob) {
      // var coordinates = [
      //   [34, 93],
      //   [20, -20],
      //   [-64, 76],
      //   [98, 17],
      //   [-86, -50],
      // ];
      // [x,y]
      var coordinates = [
        [-70, 70],
        [0, 0],
        [70, -70],
        [70, 70],
        [-70, -70],
      ];
      var res = multiply(prob, coordinates);
      return res;
    }

    function multiply(a, b) {
      var aNumRows = a.length,
        aNumCols = a[0].length,
        bNumRows = b.length,
        bNumCols = b[0].length,
        m = new Array(aNumRows); // initialize array of rows
      for (var r = 0; r < aNumRows; ++r) {
        m[r] = new Array(bNumCols); // initialize the current row
        for (var c = 0; c < bNumCols; ++c) {
          m[r][c] = 0; // initialize the current cell
          for (var i = 0; i < aNumCols; ++i) {
            m[r][c] += a[r][i] * b[i][c];
          }
        }
      }
      return m;
    }
  }

  // 散点图
  const updateChart = (point) => {
    myChart3.setOption({
      backgroundColor: "",
      xAxis: {
        type: "value",
        scale: true,
        max: 100,
        min: -100,
        interval: 20,
        splitLine: { show: false },
        axisTick: {
          show: false, // 不显示坐标轴刻度线
        },
        axisLabel: {
          show: false, // 不显示坐标轴上的文字
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        max: 100,
        min: -100,
        interval: 20,
        splitLine: { show: false },
        axisTick: {
          show: false, // 不显示坐标轴刻度线
        },
        axisLabel: {
          show: false, // 不显示坐标轴上的文字
        },
      },
      grid: {
        left: "0", //距离左边的距离
        right: "0", //距离右边的距离
        bottom: "0", //距离下边的距离
        top: "0", //距离上边的距离
      },
      series: [
        {
          type: "scatter",
          symbolSize: function (val) {
            return 16;
          },
          data: [point],
        },
      ],
    });
  };

  // 数据表
  const initChart = () => {
    Object.keys(dataArr).forEach((x) => {
      Object.keys(dataArr[x]).forEach((y) => {
        chartArr.push([parseInt(x), parseInt(y), dataArr[x][y]]);
      });
    });
    setHetmapData();
  };

  // 热力图显示
  const heatmapInstance = h337.create({
    // only container is required, the rest will be defaults
    //只需要一个container，也就是最终要绘制图形的dom节点，其他都默认
    container: document.querySelector(".heatmap"),
    radius: 8,
    maxOpacity: 0.5,
    minOpacity: 0,
    blur: 0.75,
  });
  // 设置热力图数据
  const setHetmapData = () => {
    const baseNum = 2;
    const points = chartArr.map((res) => {
      return {
        x: (res[0] + 100) * baseNum,
        y: (res[1] + 100) * baseNum,
        value: res[2],
      };
    });
    var data = {
      max: 10, //所有数据中的最大值
      data: points, //最终要展示的数据
    };
    heatmapInstance.setData(data);
  };
};
