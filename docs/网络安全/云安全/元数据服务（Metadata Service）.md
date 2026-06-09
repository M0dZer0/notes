# 元数据服务（Metadata Service）

## 什么是元数据服务

元数据服务（Metadata Service）是云厂商在**云主机实例内部**提供的一组只读或半只读 HTTP 接口，用来让实例自己获取“我是谁、我在哪、我有哪些网络和身份信息”。

它通常使用链路本地地址（link-local address）提供服务，特点是：

- 只能从实例内部访问，不能像普通公网 API 一样直接从外部访问。
- 一般不需要访问公网，也不依赖外部 DNS。
- 常用于启动初始化、自动化运维、服务发现和身份凭证获取。

常见地址如下：

| 云厂商 | 常见地址 | 说明 |
| --- | --- | --- |
| AWS | `169.254.169.254` | EC2 IMDS，常见为 IMDSv1 / IMDSv2 |
| Azure | `169.254.169.254` | Azure IMDS，需要携带 `Metadata: true` 请求头 |
| 腾讯云 | `169.254.0.23` | CVM 元数据服务，常见也可通过 `metadata.tencentyun.com` 访问 |

:::info
腾讯云资料中除了 `169.254.0.23` 外，也常见 `http://metadata.tencentyun.com` 这个内网域名；一些历史资料或兼容场景中还能看到 `169.254.10.10`。
:::

## 元数据服务能做什么

从功能上看，元数据服务主要解决的是“实例自描述”和“实例自配置”问题。

### 实例身份识别

可以获取：

- 实例 ID
- UUID
- 实例名称
- 所属地域和可用区

这些信息常被用在：

- 日志打点时标识当前实例
- Agent 自动注册到控制平面
- 启动脚本判断自己所在地域、环境、机房

### 网络信息获取

可以获取：

- 内网 IP、公网 IP
- MAC 地址
- 网卡列表
- VPC ID、子网 ID
- 网关、子网掩码

这些信息常被用在：

- 启动时自动生成网络配置
- 业务程序按网卡或子网做绑定
- CMDB / 资产系统自动采集

### 存储和实例生命周期信息

可以获取：

- 云盘列表
- 云盘类型
- 计费类型
- 创建时间
- 销毁时间
- 竞价实例中断时间

这些信息常被用在：

- 业务判断磁盘类型是否满足性能要求
- 预付费 / 竞价实例到期前自动做迁移或告警

### 启动初始化与用户数据

很多云厂商支持通过元数据服务返回 `user-data`，也就是在创建实例时传入的初始化数据。

常见用途：

- cloud-init 初始化主机
- 下发业务配置
- 写入首次启动脚本

### 临时身份凭证下发

这是安全上最敏感的一类功能。

如果实例绑定了云上角色，那么元数据服务可能会返回：

- 临时访问密钥
- 会话 Token
- 过期时间

这样实例上的程序就不需要把长期 AK/SK 写死在代码或配置文件中，而是通过元数据服务动态获取临时凭证。

## 不同云厂商的请求特点

虽然三家都叫“元数据服务”，但请求方式并不完全一样。

### AWS

AWS EC2 的元数据服务叫 IMDS（Instance Metadata Service），现在更推荐使用 `IMDSv2`。

特点：

- 地址通常是 `169.254.169.254`
- 先 `PUT` 获取 token
- 再带 token 发起后续 `GET`
- 相比 IMDSv1，对 SSRF 风险防护更强

示例：

```bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id
```

### Azure

Azure IMDS 也使用 `169.254.169.254`，但它要求显式带上 `Metadata: true` 请求头，同时一般需要 `api-version` 参数。

示例：

```bash
curl -s -H "Metadata: true" --noproxy "*" \
  "http://169.254.169.254/metadata/instance?api-version=2025-04-07"
```

### 腾讯云

腾讯云元数据服务更接近目录型 HTTP 查询：

- 常见通过 `http://metadata.tencentyun.com` 访问
- 也可使用链路本地地址 `169.254.0.23`
- 路径层级比较直观，很多接口是“列目录 -> 继续深入目录 -> 取具体值”的形式

## 腾讯云元数据服务

这一节重点记腾讯云，因为日常排障和云安全分析里经常会遇到。

### 访问方式

通常在 CVM 实例内部访问：

```bash
curl http://metadata.tencentyun.com/latest/meta-data/
```

如果想直接使用链路本地地址，可以写成：

```bash
curl http://169.254.0.23/latest/meta-data/
```

### 根目录常见内容

腾讯云元数据根目录里常见这些条目：

```bash
curl http://metadata.tencentyun.com/latest/meta-data/
```

典型返回会包含：

- `instance-id`
- `instance-name`
- `local-ipv4`
- `public-ipv4`
- `mac`
- `network/`
- `placement/`
- `uuid`

也就是说，看到带 `/` 结尾的一般是目录，继续往下查；不带 `/` 的一般就是具体值。

## 腾讯云常用请求

### 1. 获取地域和可用区

```bash
curl http://metadata.tencentyun.com/latest/meta-data/placement/region
curl http://metadata.tencentyun.com/latest/meta-data/placement/zone
```

用途：

- 判断实例在哪个 region / zone
- 启动脚本按地域加载配置
- 排障时确认业务部署位置

### 2. 获取实例内网 IP 和公网 IP

```bash
curl http://metadata.tencentyun.com/latest/meta-data/local-ipv4
curl http://metadata.tencentyun.com/latest/meta-data/public-ipv4
```

用途：

- 自动写入配置文件
- 程序启动时上报自身地址
- 排查网络问题时快速确认地址

### 3. 获取实例 ID 和 UUID

```bash
curl http://metadata.tencentyun.com/latest/meta-data/instance-id
curl http://metadata.tencentyun.com/latest/meta-data/uuid
```

说明：

- `instance-id` 是更常用的实例唯一标识
- `uuid` 也可用于标识实例，但做资产标识时一般优先使用 `instance-id`

### 4. 获取主网卡 MAC 地址

```bash
curl http://metadata.tencentyun.com/latest/meta-data/mac
```

用途：

- 后续查询具体网卡目录
- 做网卡与 IP 的精细映射

### 5. 列出所有网卡

```bash
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/
```

如果实例有多张网卡，返回结果通常会是一组 MAC 地址目录，例如：

```text
52:54:00:BF:B3:51/
```

### 6. 查看某张网卡的详细信息

```bash
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/52:54:00:BF:B3:51/
```

典型会看到：

- `local-ipv4s/`
- `mac`
- `vpc-id`
- `subnet-id`
- `owner-id`
- `primary-local-ipv4`
- `public-ipv4s`

### 7. 获取 VPC 和子网信息

```bash
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/52:54:00:BF:B3:51/vpc-id
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/52:54:00:BF:B3:51/subnet-id
```

用途：

- 判断实例在哪个 VPC / 子网
- 和 CMDB、网络策略系统做关联

### 8. 查看网卡绑定的内网 IP 列表

```bash
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/52:54:00:BF:B3:51/local-ipv4s/
```

如果一个网卡绑定多个内网 IP，这里会返回一个列表。

### 9. 查看某个内网 IP 的详细信息

```bash
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/52:54:00:BF:B3:51/local-ipv4s/10.104.13.59
```

一般能进一步看到：

- `gateway`
- `local-ipv4`
- `public-ipv4`
- `public-ipv4-mode`
- `subnet-mask`

继续取值例如：

```bash
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/52:54:00:BF:B3:51/local-ipv4s/10.104.13.59/gateway
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/52:54:00:BF:B3:51/local-ipv4s/10.104.13.59/public-ipv4
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/52:54:00:BF:B3:51/local-ipv4s/10.104.13.59/subnet-mask
```

### 10. 获取云盘信息

先列出云盘：

```bash
curl http://metadata.tencentyun.com/latest/meta-data/volumes/
```

可能返回：

```text
disk-7uflgdf3/
```

再继续查看该云盘目录：

```bash
curl http://metadata.tencentyun.com/latest/meta-data/volumes/disk-7uflgdf3/
```

再取具体字段，例如磁盘类型：

```bash
curl http://metadata.tencentyun.com/latest/meta-data/volumes/disk-7uflgdf3/disk-type
```

典型返回值可能是：

```text
CLOUD_PREMIUM
```

这个信息在性能排障时很有用，可以快速确认当前挂载的是高性能云盘、SSD 还是其他类型。

### 11. 获取计费与生命周期信息

```bash
curl http://metadata.tencentyun.com/latest/meta-data/payment/charge-type
curl http://metadata.tencentyun.com/latest/meta-data/payment/create-time
curl http://metadata.tencentyun.com/latest/meta-data/payment/termination-time
curl http://metadata.tencentyun.com/latest/meta-data/spot/termination-time
```

用途：

- 判断是按量还是包年包月
- 预判实例到期时间
- 竞价实例中断前做摘流、迁移、关机等保护动作

### 12. 获取实例所属 AppId

```bash
curl http://metadata.tencentyun.com/latest/meta-data/app-id
```

这个字段常用于和账号体系、资源归属体系做关联。

### 13. 获取 CAM 角色临时凭证

```bash
curl http://metadata.tencentyun.com/latest/meta-data/cam/security-credentials/CVMas
```

返回通常是 JSON，里面包含：

- `TmpSecretId`
- `TmpSecretKey`
- `Token`
- `Expiration`
- `ExpiredTime`

:::warning
这一类接口最敏感，因为它返回的是可用于访问云 API 的临时身份凭证。只要实例绑定了角色，运行在实例上的程序就可能通过它获取权限。
:::

### 14. 获取用户数据

```bash
curl http://metadata.tencentyun.com/latest/user-data
```

用途：

- 启动脚本读取初始化参数
- cloud-init 获取用户自定义配置
- 自动注册节点或注入业务环境变量

## 从云安全角度怎么看元数据服务

元数据服务本身不是漏洞，它是云平台的基础能力。但它经常出现在安全事件中，因为它离实例身份非常近。

### 风险点

#### SSRF 打到元数据服务

如果业务存在 SSRF，而目标实例又能访问元数据服务，那么攻击者可能借应用去读取：

- 实例信息
- 网络信息
- 用户数据
- 临时凭证

其中最危险的是角色凭证泄露，因为这可能进一步影响对象存储、消息队列、数据库、日志服务等其他云资源。

#### 容器环境中的旁路访问

如果宿主机或节点上的元数据服务没有被限制，容器内程序也可能间接访问它。这样一来，容器逃不出宿主机，也仍然可能先拿到宿主机对应的云上身份。

#### 用户数据泄露

有些团队会把初始化脚本、配置片段，甚至敏感参数放进 `user-data`。如果访问控制做得不好，这部分内容也可能被拿到。

### 防护思路

- 尽量不要在 `user-data` 中放长期密钥、数据库密码等明文敏感信息。
- 给实例绑定最小权限角色，避免拿到临时凭证后权限过大。
- 应用层重点防 SSRF，包括限制 URL 协议、目标网段和跳转行为。
- 容器环境中按需限制 Pod / 容器访问宿主机元数据服务。
- 在 AWS 中优先启用 `IMDSv2` 并关闭或限制 `IMDSv1`。
- 对需要访问元数据服务的程序建立白名单，不需要的进程和网络命名空间尽量隔离。

## 记忆重点

- 元数据服务本质上是“实例给自己看的 HTTP 信息接口”。
- 它最重要的价值有两类：一类是**实例信息**，一类是**临时身份凭证**。
- 腾讯云常见访问方式是 `metadata.tencentyun.com` 或 `169.254.0.23`。
- 腾讯云常用查询重点记这几类：
  - `instance-id` / `uuid`
  - `placement/region` / `placement/zone`
  - `local-ipv4` / `public-ipv4`
  - `network/interfaces/macs/`
  - `volumes/`
  - `payment/`
  - `cam/security-credentials/<RoleName>`
  - `user-data`

## 一组最常用的腾讯云速查命令

```bash
curl http://metadata.tencentyun.com/latest/meta-data/
curl http://metadata.tencentyun.com/latest/meta-data/instance-id
curl http://metadata.tencentyun.com/latest/meta-data/uuid
curl http://metadata.tencentyun.com/latest/meta-data/placement/region
curl http://metadata.tencentyun.com/latest/meta-data/placement/zone
curl http://metadata.tencentyun.com/latest/meta-data/local-ipv4
curl http://metadata.tencentyun.com/latest/meta-data/public-ipv4
curl http://metadata.tencentyun.com/latest/meta-data/mac
curl http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs/
curl http://metadata.tencentyun.com/latest/meta-data/volumes/
curl http://metadata.tencentyun.com/latest/meta-data/payment/charge-type
curl http://metadata.tencentyun.com/latest/user-data
```
