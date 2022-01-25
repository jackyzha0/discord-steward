# 🌿 Steward
> The order of civilization. The fast layers innovate; the slow layers stabilize. The whole combines learning with continuity.
>   -- Stewart Brand

A [pace-layered](https://jzhao.xyz/thoughts/pace-layers/) approach to high-volume Discord Servers.

Stream interfaces like Discord and Slack basically create a single global timeline that moves at a certain rate. If you miss a certain conversation, it flows away.
Someone once described Slack as the online version of the open office arrangement – it puts the pressure of everything being visible all the time to everybody on the individual.

How can we create [mangroves](https://jzhao.xyz/thoughts/Mangrove-Theory-of-the-Internet)? Garden/forest type ecosystems which have gently flowing multi-branched stream systems, designed for digital mindfulness and non-linearity?

Steward is an attempt to give back agency to users to control the speed of information in the projects they are a part of.

## Installation
[Invite the Steward to your server!](https://discord.com/api/oauth2/authorize?client_id=933619858120249374&permissions=268438608&scope=bot%20applications.commands)

*Caution: Steward is still in alpha development. Any potential damage/loss of data is incurred your own discretion.*

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run)

## Terminology
1. Workflow/Project: a group of people working on a cohesive effort/artifact that has multiple pace layers
2. Pace Layer: a number representing volume of messages. Layers are ordered in terms of 'pace' or message flow. Lower layer number means more frequent and noisy updates, whereas higher layer numbers are less frequent and higher signal information.

## User Guide
### For Server Admins
Steward integrates well into existing discord servers!

- To mark a channel as a workflow, just prefix it with a 🌿 emoji. When finished, run `/steward reset` to set up all the appropriate roles and permissions.
- You can make new pace layers under workflows by just creating new text channels under the category suffixed with `<channel-name>-p#` where `#` is the layer number.

### For Users
Here's the typical user flow.

- See what workflows are available using `/workflows list`
- Join a workflow using `/workflows join`
- Set your pace level using `/pace set`
- React to messages using ✨. This is referred to as 'democratic pinning' where messages that surpass a number of reactions get boosted up a pace layer.