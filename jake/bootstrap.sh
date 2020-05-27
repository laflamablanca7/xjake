#!/bin/bash
node_ver='v12.14.0' # circleci image node version
uname=`uname`
if [[ $uname =~ Darwin ]]; then
  node_ver='v12.16.2'
  ver=`which brew && brew --version`
  if [ $? != 0 ]; then
    /usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
  fi
  echo 'brew OK'
  ver=`which wget && wget --version 2&>/dev/null`
  if [ $? != 0 ]; then
    brew install wget
  fi
  echo 'wget OK'
  ver=`node -v`
  # XXX: mwerge with command under -f
  if [ "$ver" != $node_ver ]; then
    brew uninstall node
    brew uninstall node@12
    # node@12
    brew install 'https://raw.githubusercontent.com/Homebrew/homebrew-core/e7f5eede1181d0fc5c1d085e953948a6639b4f80/Formula/node@12.rb'
    # XXX: add support when older version of node and have to run
    # brew uninstall node && brew link --force --overwrite node@12
    if [ "$ver" != $node_ver ]; then
      echo 'older verison of node linked run:'
      echo 'brew uninstall node; brew link --force --overwrite node@12'
      exit 1
    fi
    echo 'node OK'
  else
    echo 'node OK'
  fi
  # XXX: add support to check chrome and say how to install
else
  node_ver='v12.16.3' # XXX: add support for more versions
  node_ver='v12.16.1'
  node_ver='v12.17.0'
  ver=`curl --version`
  if [ $? != 0 ]; then
    sudo apt install curl
  fi
  echo 'curl OK'
  ver=`wget --version`
  if [ $? != 0 ]; then
    sudo apt install wget
  fi
  echo 'wget OK'
  ver=`node -v`
  res=$?
  # XXX: mwerge with command under -f
  cmd="curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash - && \
  sudo apt-get update && sudo apt-get install -y nodejs"
  if [[ $res -eq 127 ]] || [ $ver != $node_ver ]; then
    if [ "$1" == '-f' ]; then
      curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash - && \
        sudo apt-get update && sudo apt-get install -y nodejs
      echo 'node OK'
    else
      echo 'node failed, must install node 12, run the following command'
      echo $cmd
    fi
  else
    echo 'node OK'
  fi
fi
